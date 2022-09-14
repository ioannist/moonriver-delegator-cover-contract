// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/StakingInterface.sol";
import "../interfaces/IOracleMaster.sol";
import "../interfaces/Types.sol";
import "../interfaces/IAuthManager.sol";
import "../interfaces/IInactivityCover.sol";
import "./DepositStaking.sol";

contract InactivityCover {
    //using SafeCast for uint256;

    struct ScheduledDecrease {
        uint128 era; // the era when the scheduled decrease was created
        uint256 amount;
    }

    struct Member {
        bool isMember; // once a member, always a member
        bool active; // starts active, can go inactive by reducing deposit to less than minimum deposit
        uint256 amount; // deposit
        uint256 maxDefaulted; // the max cover payment was has defaulted and is pending
    }

    event DepositEvent(address member, uint256 amount);
    event DecreaseCoverScheduledEvent(address member, uint256 amount);
    event DecreaseCoverEvent(address member, uint256 amount);
    event CancelDecreaseCoverEvent(address member);
    event ReportPushedEvent(uint128 eraId, uint256 coverClaims);
    event MemberNotActive(address member, uint128 eraId);
    event MemberHasZeroPoints(address member, uint128 eraId);
    event PayoutEvent(address delegator, uint256 amount);

    /// The ParachainStaking wrapper at the known pre-compile address. This will be used to make all calls
    /// to the underlying staking solution
    ParachainStaking public staking;

    // auth manager contract address
    address public AUTH_MANAGER;
    // oracle master contract
    address public ORACLE_MASTER;
    // deposit staking contract
    address public DEPOSIT_STAKING;

    // CONSTANTS
    // Minimum amount a user can deposit
    uint256 public MIN_DEPOSIT;
    // Maximum total amount a user can deposit
    uint256 public MAX_DEPOSIT_TOTAL;
    // Refund given per 1 MOVR staked for every missed round
    uint256 public STAKE_UNIT_COVER;
    // Minimum one-time payment for a delegator
    uint256 public MIN_PAYOUT;
    // Minimum number of eras between forced undelegations
    uint128 public ERAS_BETWEEN_FORCED_UNDELEGATION;

    //Variables for Cover Claims
    // Current era id (round)
    uint64 public eraId;
    // Whitelisted members
    mapping(address => bool) public whitelisted;
    // Total members
    uint256 public membersDepositTotal;
    // Addresss of any account that has ever made a deposit
    address[] public memberAddresses;
    // Adresses to deposit amounts
    mapping(address => Member) public members;
    // Scheduled cover decreases by members
    mapping(address => ScheduledDecrease) public scheduledDecreasesMap;
    // Toal amount owed to delegators to pay all pending cover claims
    // Τhe contract's balance can grow through staking so we need to cover the deposited amount separately
    uint256 public coverOwedTotal;
    // The number of eras each member covers (forecast)
    // this is also the number of eras a member must wait to execute a decrease request
    mapping(address => uint128) public erasCovered;
    // map of delegators to amounts owed by collators
    mapping(address => mapping(address => uint256)) payoutAmounts;

    /* If a collator cannot withdraw their funds due to the funds being locked in staking, their address is
    recorded in memberNotPaid .This will prohibit the manager from bonding more until that collator is paid
    by forcing undelegate
    */
    address public memberNotPaid;
    // Same as above for delegators who cannot claims their cover due to funds being locked
    address public delegatorNotPaid;

    // Manager role
    bytes32 internal constant ROLE_MANAGER = keccak256("ROLE_MANAGER");

    // Allows function calls only from Oracle
    modifier onlyOracle() {
        address oracle = IOracleMaster(ORACLE_MASTER).getOracle(address(this));
        require(msg.sender == oracle, "NOT_OR");
        _;
    }

    // Allows function calls only from Oracle
    modifier onlyDepositStaking() {
        require(msg.sender == DEPOSIT_STAKING, "NOT_DS");
        _;
    }

    // Allows function calls only from member with specific role
    modifier auth(bytes32 role) {
        require(IAuthManager(AUTH_MANAGER).has(role, msg.sender), "UNAUTH");
        _;
    }

    /**
     * @notice Initialize contract.
     */
    function initialize(
        address _auth_manager,
        address _oracle_master,
        address _deposit_staking,
        uint256 _min_deposit,
        uint256 _max_deposit_total,
        uint256 _stake_unit_cover,
        uint256 _min_payout,
        uint128 _eras_between_forced_undelegation
    ) external {
        require(
            AUTH_MANAGER == address(0) && _auth_manager != address(0),
            "NOT_ALLOWED"
        );
        staking = ParachainStaking(0x0000000000000000000000000000000000000100);
        AUTH_MANAGER = _auth_manager;
        ORACLE_MASTER = _oracle_master;
        DEPOSIT_STAKING = _deposit_staking;
        MIN_DEPOSIT = _min_deposit;
        MAX_DEPOSIT_TOTAL = _max_deposit_total;
        MIN_PAYOUT = _min_payout;
        STAKE_UNIT_COVER = _stake_unit_cover;
        ERAS_BETWEEN_FORCED_UNDELEGATION = _eras_between_forced_undelegation;
    }

    /** @dev Deposit cover funds for a member collator. Anybody can deposit funds for a collator, but only
    the collator can withdraw. The collator must be whitelisted. If the collator is at default (out of
    funds and not recording missed rounds), this method will cause the collator to resume cover.
     @param collator The collator address the deposit is for.
    */
    function depositCover(address collator) external payable {
        require(whitelisted[collator], "");
        require(msg.value >= MIN_DEPOSIT, "BEL_MIN_DEP"); // avoid spam deposits
        require(
            msg.value >= members[collator].maxDefaulted,
            "BELOW_MAX_DEFAULT"
        );
        require(collator != address(0), "ZERO_ADDR");
        require(
            members[collator].amount + msg.value <= MAX_DEPOSIT_TOTAL,
            "EXCEEDS_MAX_DEPOSIT_TOTAL"
        );

        if (!members[collator].isMember) {
            memberAddresses.push(collator);
            members[collator].isMember = true;
        }
        members[collator].active = true;
        members[collator].amount += msg.value;
        delete members[collator].maxDefaulted;
        membersDepositTotal += msg.value;
        emit DepositEvent(collator, msg.value);
    }

    /** @dev A member can request to withdraw its cover funds. The member has to wait for a number of rounds
    until they can withdraw. During this waiting time, their funds continue to cover their delegators.
     @param amount How much to decrease the cover by.
    */
    function scheduleDecreaseCover(uint256 amount) external {
        _scheduleDecreaseCover(amount, msg.sender);
    }

    /// @dev Allows the manager to schedule a refund of the deposit back to a member that is no longer whitelisted
    /// @param amount How much to refund back.
    /// @param member The member to refund their deposit to.
    function scheduleDecreaseCoverManager(uint256 amount, address member)
        external
        auth(ROLE_MANAGER)
    {
        require(!whitelisted[member], "IS_WLISTED");
        _scheduleDecreaseCover(amount, member);
    }

    /** @dev Allows the manager to withdraw any contract balance that is above the total deposits balance.
        This includes staking rewards or other funds that were sent tot he contract.
        @param amount How much to withdraw
        @param receiver Who to send the withdrawal to
    */
    function withdrawRewards(uint256 amount, address payable receiver)
        external
        auth(ROLE_MANAGER)
    {
        // The contract must have enough non-locked funds
        require(address(this).balance > 0, "NO_FUNDS");
        // The remaining funds after the withdrawal must exceed the deposited funds + the owed funds, i.e. cannot withdraw member funds, but only staking rewards;
        // because _get_free_balance does not include contract funds in unlocking (understated), this check might fail (false negative) to withdraw if a contract undelegation is pending
        // however, the check will never allow withdrawal of member funds (no false positives)
        require(
            _getFreeBalance() - amount > membersDepositTotal + coverOwedTotal,
            "NO_REWARDS"
        );
        (bool sent, ) = receiver.call{value: amount}("");
        require(sent, "TRANSF_FAIL");
    }

    /// @dev Execute a scheduled cover decrease (withdrawal) by a member
    /// @param collator The collator member whose scheduled withdrawal we are executing (anybody can execute it)
    function executeScheduled(address payable collator) external {
        require(scheduledDecreasesMap[collator].amount != 0, "DECR_N_EXIST");
        require(erasCovered[collator] > 0, "DEL_N_SET");
        require(
            // The current era must be after the era the decrease is scheduled for
            // The manager can change the EXECUTE_DELAY after the decrease was scheduled by the memver, so the "scheduled date" is not fixed
            scheduledDecreasesMap[collator].era + erasCovered[collator] <=
                eraId,
            "NOT_EXECUTABLE"
        );

        uint256 amount = scheduledDecreasesMap[collator].amount;
        // Check if contract has enough reducible balance (may be locked in staking)
        if (address(this).balance < amount) {
            // Only update if not already set
            // This means that memberNotPaid will always store the first member that was not paid and only that member, until they are paid
            if (memberNotPaid == address(0)) {
                memberNotPaid = collator;
            }
            return;
        }
        // Reset memberNotPaid to 0 if it was set to this collator, otherwise leave as is
        if (memberNotPaid == collator) {
            memberNotPaid = address(0);
        }

        members[collator].amount -= amount;
        if (members[collator].amount < MIN_DEPOSIT) {
            members[collator].active = false;
        }
        membersDepositTotal -= amount;
        delete scheduledDecreasesMap[collator];
        emit DecreaseCoverEvent(collator, amount);

        (bool sent, ) = collator.call{value: amount}("");
        require(sent, "TRANSF_FAIL");
    }

    /// @dev Cancel a scheduled cover decrease (withdrawal)
    function cancelDecreaseCover() external {
        require(members[msg.sender].amount > 0, "NO_DEP");
        require(scheduledDecreasesMap[msg.sender].amount > 0, "DECR_N_EXIST");
        delete scheduledDecreasesMap[msg.sender];
        emit CancelDecreaseCoverEvent(msg.sender);
    }

    /// @dev The method is used by the oracle to push data into the contract and calculate potential cover claims.
    /// @param _eraId The round number
    /// @param _report The collator data, including authored block counts, delegators, etc.
    function pushData(uint64 _eraId, Types.OracleData calldata _report)
        external
        onlyOracle
    {
        require(_eraId > eraId, "PAST_ERA");
        eraId = _eraId;
        uint256 coverClaims;

        for (uint256 i = 0; i < _report.collators.length; i++) {
            Types.CollatorData memory collatorData = _report.collators[i];
            if (
                !members[collatorData.collatorAccount].isMember ||
                !members[collatorData.collatorAccount].active
            ) {
                continue; // not a member or not active
            }

            // the larger the deposit, the longer the waiting period for decreasing it
            uint256 refundPerEra = (collatorData.delegationsTotal *
                STAKE_UNIT_COVER) / 1 ether;
            uint128 erasCov = uint128(
                members[collatorData.collatorAccount].amount / refundPerEra
            );
            erasCovered[collatorData.collatorAccount] = erasCov <= 1080
                ? erasCov
                : 1080; // max 3 months

            bool mustPay;
            if (!collatorData.active) {
                // if collator is out of the active set
                emit MemberNotActive(collatorData.collatorAccount, eraId);
                mustPay = true;
            }
            if (collatorData.active && collatorData.points == 0) {
                // if collator is in the active set but produced 0 blocks
                emit MemberHasZeroPoints(collatorData.collatorAccount, eraId);
                mustPay = true;
            }
            if (!mustPay) {
                continue;
            }

            for (
                uint128 j = 0;
                j < collatorData.topActiveDelegations.length;
                j++
            ) {
                Types.DelegationsData memory delegationData = collatorData
                    .topActiveDelegations[j];
                address delegator = delegationData.ownerAccount;
                address collator = collatorData.collatorAccount;
                uint256 delegation = delegationData.amount;
                if (delegation <= 0) {
                    // should not happen, as client should pass only positive delegations
                    continue;
                }

                uint256 toPay = STAKE_UNIT_COVER * (delegation / 1 ether);
                if (membersDepositTotal < toPay) {
                    // should never happen; guard against overflow error
                    continue;
                }
                if (members[collator].amount < toPay) {
                    members[collator].maxDefaulted = toPay >
                        members[collator].maxDefaulted
                        ? toPay
                        : members[collator].maxDefaulted;
                    continue;
                    // we don't skip defaulted collators to allow smaller claims to go through
                }

                payoutAmounts[delegator][collator] += toPay; // credit the delegator
                members[collator].amount -= toPay; // debit the collator deposit
                membersDepositTotal -= toPay; // decrease the total members deposit
                coverOwedTotal += toPay; // current total (not paid out)
                coverClaims += toPay; // for this round (oracle push)
            }
        }
        emit ReportPushedEvent(eraId, coverClaims);
    }

    /** @dev Anybody can execute this method to pay out cover claims to any delegator
        @param delegators The delegators to pay cover claims to. These are accumulated claims and could
        even be from multiple collators that missed rounds.
        @param collators The corresponding collators that the delegators are caliming from
    */
    function payOutCover(
        address payable[] calldata delegators,
        address[] calldata collators
    ) external {
        require(delegators.length == collators.length, "INVALID");

        for (uint256 i = 0; i < delegators.length; i++) {
            address delegator = delegators[i];
            address collator = collators[i];
            require(
                delegator != address(0) && collator != address(0),
                "ZERO_ADDR"
            );

            uint256 toPay = payoutAmounts[delegator][collator];
            if (toPay == 0) {
                continue;
            }
            if (toPay < MIN_PAYOUT) {
                continue;
            }
            // Check if contract has enough reducible balance (may be locked in staking)
            if (address(this).balance < toPay) {
                // only update if not already set
                if (delegatorNotPaid == address(0)) {
                    delegatorNotPaid = delegator;
                }
                // will continue paying as many delegators as possible (smaller amounts owed) until drained
                continue;
            }
            // Reset delegatorNotPaid to 0 (if it is this delegator) as it can now get paid
            if (delegatorNotPaid == delegator) {
                delegatorNotPaid = address(0);
            }

            // delete payout entry from delegator
            delete payoutAmounts[delegator][collator];
            // remove collator from addresses that owe cover to this delegator
            coverOwedTotal -= toPay; // debit the total cover owed
            emit PayoutEvent(delegator, toPay);

            (bool sent, ) = delegator.call{value: toPay}("");
            require(sent, "TRANSF_FAIL");
        }
    }

    function getDeposit(address member) external view returns (uint256) {
        return members[member].amount;
    }

    function getIsMember(address member) external view returns (bool) {
        return members[member].isMember;
    }

    function getIsActive(address member) external view returns (bool) {
        return members[member].active;
    }

    function getMaxDefault(address member) external view returns (uint256) {
        return members[member].maxDefaulted;
    }

    function getScheduledDecrease(address member)
        external
        view
        returns (uint128, uint256)
    {
        return (
            scheduledDecreasesMap[member].era,
            scheduledDecreasesMap[member].amount
        );
    }

    function getPayoutAmount(address delegator, address collator)
        external
        view
        returns (uint256)
    {
        return payoutAmounts[delegator][collator];
    }

    function getErasCovered(address member) external view returns (uint128) {
        return erasCovered[member];
    }

    /// @dev Set the minimum member deposit allowed
    /// @param _min_deposit The min deposit
    function setMinDeposit(uint256 _min_deposit) external auth(ROLE_MANAGER) {
        MIN_DEPOSIT = _min_deposit;
    }

    /// @dev Set the maximum total deposit. Member collators cannot deposit more than this total amount.
    /// @param _max_deposit_total The max deposit allowed
    function setMaxDepositTotal(uint256 _max_deposit_total)
        external
        auth(ROLE_MANAGER)
    {
        MAX_DEPOSIT_TOTAL = _max_deposit_total;
    }

    /// @dev Manager can override execute delay (this is temporary and will be overwritten in next pushData)
    /// @param _execute_delay The decrease execution delay
    function setExecuteDelay(uint128 _execute_delay, address member)
        external
        auth(ROLE_MANAGER)
    {
        // Cannot set delay to longer than 3 months (12 rounds per day * 30 * 3)
        require(_execute_delay <= 1080, "HIGH_DELAY");
        erasCovered[member] = _execute_delay;
    }

    function setStakeUnitCover(uint256 _stake_unit_cover)
        external
        auth(ROLE_MANAGER)
    {
        STAKE_UNIT_COVER = _stake_unit_cover;
    }

    function setMinPayout(uint256 _min_payout) external auth(ROLE_MANAGER) {
        // Protect delegators from having to wait forever to get paid due to an unresonable min payment
        require(_min_payout <= 10 ether, "HIGH_MIN_PAYM");
        MIN_PAYOUT = _min_payout;
    }

    function setErasBetweenForcedUndelegations(
        uint128 _eras_between_forced_undelegation
    ) external auth(ROLE_MANAGER) {
        // Protect contract from multiple undelegations without allowing time to unbond
        require(
            _eras_between_forced_undelegation <= 300,
            "TOO_HIGH_ERAS_BETWEEN_FORCED_UNDELEGATION"
        );
        ERAS_BETWEEN_FORCED_UNDELEGATION = _eras_between_forced_undelegation;
    }

    function whitelist(address newMember, bool status)
        external
        auth(ROLE_MANAGER)
    {
        whitelisted[newMember] = status;
    }

    function delegate(
        address candidate,
        uint256 amount,
        uint256 candidateDelegationCount,
        uint256 delegatorDelegationCount
    ) external virtual onlyDepositStaking {
        staking.delegate(
            candidate,
            amount,
            candidateDelegationCount,
            delegatorDelegationCount
        );
    }

    function delegator_bond_more(address candidate, uint256 more)
        external
        virtual
        onlyDepositStaking
    {
        staking.delegator_bond_more(candidate, more);
    }

    function schedule_delegator_bond_less(address candidate, uint256 less)
        external
        virtual
        onlyDepositStaking
    {
        staking.schedule_delegator_bond_less(candidate, less);
    }

    /** @dev Private method for scheduling a withdrawal of cover funds by a member. Can only be called by the
    collator itself. Only one scheduled decrease can exist per member at a time. Members might have to call
    this method a number of time to withdraw all funds due to the MAX_COVER_DECREASE limit. This is to protect
    delegators. For exaple, if a member provides a cover for 3 months, delegators should be able to assume
    that even if that member schedules a decrease tomorrow, they would still be protected for 3 months.
     @param amount The amount to decrease the cover deposit by.
     @param member The member to refund their deposit to.
    */
    function _scheduleDecreaseCover(uint256 amount, address member) private {
        require(amount > 0, "ZERO_DECREASE");
        require(members[member].amount > 0, "NO_DEP");
        require(members[member].amount >= amount, "EXCEED_DEP");
        require(scheduledDecreasesMap[msg.sender].amount == 0, "DECR_EXIST");
        scheduledDecreasesMap[member] = ScheduledDecrease(eraId, amount);
        emit DecreaseCoverScheduledEvent(member, amount);
    }

    function _getFreeBalance() private view returns (uint256) {
        // The method returns the current free balance (reducible + locked), but it excludes funds
        // in unlocking (soon to be reducible)
        return
            address(this).balance +
            DepositStaking(DEPOSIT_STAKING).stakedTotal(); // reducible + locked
    }

    receive() external payable {}
}
