// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma abicoder v2;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/StakingInterface.sol";
import "../interfaces/IOracleMaster.sol";
import "../interfaces/Types.sol";
import "../interfaces/IAuthManager.sol";
import "../interfaces/IPushable.sol";
import "../interfaces/IProxy.sol";
import "./DepositStaking.sol";

contract InactivityCover is IPushable {
    struct ScheduledDecrease {
        uint128 era; // the era when the scheduled decrease was created
        uint256 amount;
    }

    struct Member {
        bool isMember; // once a member, always a member
        bool active; // starts active, can go inactive by reducing deposit to less than minimum deposit
        uint256 deposit; // deposit
        uint256 maxDefaulted; // the max cover payment that has defaulted and is pending
        uint256 maxCoveredDelegation; // any amount of this limit is not covered (used to incentivize splitting large delegations among multiple collators)
        uint128 lastPushedEra; // the last era that was pushed and processed for this member; oracles may agree to not report an era for a member if there is no effect (no cover claims)
        uint256 lastDelegationsTotall; // total backing of this collator the last time a report was pushed
        uint128 noZeroPtsCoverAfterEra; // if positive (non-zero), then the member does not offer 0-point cover after this era
        uint128 noActiveSetCoverAfterEra; // if positive (non-zero), the member does not offer out-of-active-set cover after this era
    }

    event DepositEvent(address member, uint256 amount);
    event DecreaseCoverScheduledEvent(address member, uint256 amount);
    event DecreaseCoverEvent(address member, uint256 amount);
    event CancelDecreaseCoverEvent(address member);
    event ReportPushedEvent(uint128 eraId, address oracle);
    event MemberNotActiveEvent(address member, uint128 eraId);
    event MemberHasZeroPointsEvent(address member, uint128 eraId);
    event PayoutEvent(address delegator, uint256 amount);
    event DelegatorNotPaidEvent(address delegator, uint256 amount);
    event DelegatorPayoutLessThanMinEvent(address delegator);
    event MemberNotPaidEvent(address member, uint256 amount);
    event MemberSetMaxCoveredDelegationEvent(address member, uint256 amount);
    event MemberSetCoverTypesEvent(
        address member,
        bool noZeroPtsCoverAfterEra,
        bool noActiveSetCoverAfterEra
    );

    /// The ParachainStaking wrapper at the known pre-compile address. This will be used to make all calls
    /// to the underlying staking solution
    ParachainStaking public staking;
    IProxy public proxy;

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
    uint128 public eraId;
    // Whitelisted members to their proxy/management accounts
    mapping(address => address) public whitelisted;
    // Total members deposit
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
    mapping(address => uint256) public payoutAmounts;
    // map of total payouts to delegators
    mapping(address => uint256) public totalPayouts;
    // If not 0, the oracle is credited with the tx cost for caclulating the cover payments
    uint256 refundOracleGasPrice;

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
        address oracle = IOracleMaster(ORACLE_MASTER).getOracle();
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
            "ALREADY_INITIALIZED"
        );
        staking = ParachainStaking(0x0000000000000000000000000000000000000800);
        proxy = IProxy(0x000000000000000000000000000000000000080b);
        AUTH_MANAGER = _auth_manager;
        ORACLE_MASTER = _oracle_master;
        DEPOSIT_STAKING = _deposit_staking;
        MIN_DEPOSIT = _min_deposit;
        MAX_DEPOSIT_TOTAL = _max_deposit_total;
        MIN_PAYOUT = _min_payout;
        STAKE_UNIT_COVER = _stake_unit_cover;
        ERAS_BETWEEN_FORCED_UNDELEGATION = _eras_between_forced_undelegation;
    }

    /// ***************** MEMBER (COLLATOR) FUNCS *****************

    /** @dev Deposit cover funds for a member collator. Anybody can deposit funds for a collator, but only
    the collator can withdraw. The collator must be whitelisted. If the collator is at default (out of
    funds and not recording missed rounds), this method will cause the collator to resume cover.
     @param _member The collator address the deposit is for.
    */
    function depositCover(address _member) external payable {
        require(whitelisted[_member] != address(0), "NOT_WLISTED");
        require(msg.value >= MIN_DEPOSIT, "BEL_MIN_DEP"); // avoid spam deposits
        require(msg.value >= members[_member].maxDefaulted, "BEL_MAX_DEFAULT");
        require(_member != address(0), "ZERO_ADDR");
        require(
            members[_member].deposit + msg.value <= MAX_DEPOSIT_TOTAL,
            "EXC_MAX_DEP"
        );

        if (!members[_member].isMember) {
            memberAddresses.push(_member);
            members[_member].isMember = true;
            members[_member].maxCoveredDelegation = type(uint256).max; // default no-max value (editable)
            erasCovered[_member] = 8; // initial cover period - to be updated in the next oracle push
        } else {
            _updateErasCovered(_member, members[_member].lastDelegationsTotall);
        }

        members[_member].active = true;
        members[_member].deposit += msg.value;
        delete members[_member].maxDefaulted;
        membersDepositTotal += msg.value;
        emit DepositEvent(_member, msg.value);
    }

    /** @dev A member can request to withdraw its cover funds. The member has to wait for a number of rounds
    until they can withdraw. During this waiting time, their funds continue to cover their delegators.
     @param amount How much to decrease the cover by.
    */
    function scheduleDecreaseCover(address _member, uint256 amount) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        _scheduleDecreaseCover(amount, _member);
    }

    /// @dev Cancel a scheduled cover decrease (withdrawal)
    function cancelDecreaseCover(address _member) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        require(members[_member].deposit > 0, "NO_DEP");
        require(scheduledDecreasesMap[_member].amount > 0, "DECR_N_EXIST");
        delete scheduledDecreasesMap[_member];
        emit CancelDecreaseCoverEvent(_member);
    }

    /// @dev Members can choose to protect delegations up to a specific amount (this might incentivize delegators to spread their stake among collators)
    /// @param _max_covered the max delegation that is covered (any amount above that will not receive rewards cover)
    function memberSetMaxCoveredDelegation(
        address _member,
        uint256 _max_covered
    ) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        require(members[_member].active, "NOT_ACTIVE");
        // To disable max_covered, we can use a very high value.
        require(_max_covered >= 500 ether, "INVALID"); // TODO change value for Moonbeam
        members[_member].maxCoveredDelegation = _max_covered;
        emit MemberSetMaxCoveredDelegationEvent(_member, _max_covered);
    }

    /// @dev Members can protect their delegators against them going down (zero points) or out (not in active set) or both. At least one cover type is required.
    /// @param _noZeroPtsCoverAfterEra true if you want to cover being down, false otherwise
    /// @param _noActiveSetCoverAfterEra true if you want to cover being out, false otherwise
    function memberSetCoverTypes(
        address _member,
        bool _noZeroPtsCoverAfterEra,
        bool _noActiveSetCoverAfterEra
    ) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        require(members[_member].active, "NOT_ACTIVE");
        // at least one of the cover types must be active (true)
        require(
            _noZeroPtsCoverAfterEra || _noActiveSetCoverAfterEra,
            "INV_COVER"
        );
        // The eraIds signify the eras on which the cover stopped being advertised on the stakeX website.
        // This is not the same as the era when the cover stopped protecting the delegators! That era equals eraId + erasCovered[msg.sender]
        members[_member].noZeroPtsCoverAfterEra = _noZeroPtsCoverAfterEra
            ? _getEra()
            : 0;
        members[_member].noActiveSetCoverAfterEra = _noActiveSetCoverAfterEra
            ? _getEra()
            : 0;
        emit MemberSetCoverTypesEvent(
            _member,
            _noZeroPtsCoverAfterEra,
            _noActiveSetCoverAfterEra
        );
    }

    /// ***************** MEMBER FUNCS THAT CAN BE CALLED BY ANYBODY *****************

    /// @dev Execute a scheduled cover decrease (withdrawal) by a member
    /// @param _member The collator member whose scheduled withdrawal we are executing (anybody can execute it)
    function executeScheduled(address payable _member) external {
        require(scheduledDecreasesMap[_member].amount != 0, "DECR_N_EXIST");
        require(
            // The current era must be after the era the decrease is scheduled for
            // The manager can change the EXECUTE_DELAY after the decrease was scheduled by the member, so the "scheduled date" is not fixed
            scheduledDecreasesMap[_member].era + erasCovered[_member] <=
                _getEra(),
            "NOT_EXEC"
        );

        uint256 amount = scheduledDecreasesMap[_member].amount;
        // Check if contract has enough reducible balance (may be locked in staking)
        if (address(this).balance < amount) {
            // Only update if not already set
            // This means that memberNotPaid will always store the first member that was not paid and only that member, until they are paid
            if (memberNotPaid == address(0)) {
                memberNotPaid = _member;
                emit MemberNotPaidEvent(_member, amount);
            }
            return;
        }
        // Reset memberNotPaid to 0 if it was set to this collator, otherwise leave as is
        if (memberNotPaid == _member) {
            memberNotPaid = address(0);
        }

        members[_member].deposit -= amount;
        if (members[_member].deposit < MIN_DEPOSIT) {
            members[_member].active = false;
        }
        membersDepositTotal -= amount;
        delete scheduledDecreasesMap[_member];
        emit DecreaseCoverEvent(_member, amount);

        (bool sent, ) = _member.call{value: amount}("");
        require(sent, "TRANSF_FAIL");
    }

    /** @dev Pays out the accumulated delegator rewards claims to the given delegators.
        The method can be called by anybody (similar to Moonbeam's execute delegation decrease).
        This is required, so that (for example), the manager can initiate a previously defaulted payment
        to reset the notPaid flag and disable forceScheduleRevoke.
        @param delegators The delegators to pay cover claims to. These are accumulated claims and could even be from multiple collators.
    */
    function payOutCover(address payable[] calldata delegators) external {
        for (uint256 i = 0; i < delegators.length; i++) {
            address delegator = delegators[i];
            require(delegator != address(0), "ZERO_ADDR");

            uint256 toPay = payoutAmounts[delegator];
            if (toPay == 0 || toPay < MIN_PAYOUT) {
                emit DelegatorPayoutLessThanMinEvent(delegator);
                continue;
            }
            // Check if contract has enough reducible balance (may be locked in staking)
            if (address(this).balance < toPay) {
                // only update if not already set
                if (delegatorNotPaid == address(0)) {
                    delegatorNotPaid = delegator;
                }
                // will continue paying as many delegators as possible (smaller amounts owed) until drained
                emit DelegatorNotPaidEvent(delegator, toPay);
                continue;
            }
            // Reset delegatorNotPaid to 0 (if it is this delegator) as they can now get paid
            if (delegatorNotPaid == delegator) {
                delegatorNotPaid = address(0);
            }

            // delete payout entry from delegator
            delete payoutAmounts[delegator];
            // remove collator from addresses that owe cover to this delegator
            coverOwedTotal -= toPay; // debit the total cover owed
            totalPayouts[delegator] += toPay;
            emit PayoutEvent(delegator, toPay);

            (bool sent, ) = delegator.call{value: toPay}("");
            require(sent, "TRANSF_FAIL");
        }
    }

    /// ***************** MANAGEMENT FUNCTIONS *****************

    /** @dev Allows the manager to withdraw any contract balance that is above the total deposits balance.
        This includes contract staking rewards or other funds that were sent to the contract outside the deposit function.
        @param amount How much to withdraw
        @param receiver Who to send the withdrawal to
    */
    function withdrawRewards(uint256 amount, address payable receiver)
        external
        auth(ROLE_MANAGER)
    {
        // The contract must have enough non-locked funds
        require(address(this).balance > amount, "NO_FUNDS");
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

    function whitelist(address _member, address proxyAccount)
        external
        auth(ROLE_MANAGER)
    {
        require(whitelisted[_member] == address(0), "ALREADY_WHITELISTED");
        whitelisted[_member] = proxyAccount;
    }

    function transferProxy(address _member, address proxyAccount) external {
        require(whitelisted[_member] == msg.sender, "UNAUTH");
        whitelisted[_member] = proxyAccount;
    }

    function executeDelegationRequest(address delegator, address candidate)
        external
    {
        staking.executeDelegationRequest(delegator, candidate);
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
        require(_execute_delay <= 1080, "HIGH");
        erasCovered[member] = _execute_delay;
    }

    /// @dev Sets the cover refund given to delegators for every 1 MOVR staked per round
    /// @param _stake_unit_cover the unit cover
    function setStakeUnitCover(uint256 _stake_unit_cover)
        external
        auth(ROLE_MANAGER)
    {
        uint256 maxAPR = 30; // 30%
        uint256 minRoundsPerDay = 1; // current is 12, but this might change
        // Protect against nonsensical values of unit cover that could drain the account
        // Currently the worst case scenario (maxed unit cover) is that delegators get 30% * 12 = 360% APR
        require(
            _stake_unit_cover <
                (maxAPR * 1 ether) / (100 * 365 * minRoundsPerDay),
            "HIGH"
        );
        STAKE_UNIT_COVER = _stake_unit_cover;
    }

    /// @dev Sets the minimum amount that a delegator can claim form accumulated covers
    /// @param _min_payout the min payout amount
    function setMinPayout(uint256 _min_payout) external auth(ROLE_MANAGER) {
        // Protect delegators from having to wait forever to get paid due to an unresonable min payment
        require(_min_payout <= 10 ether, "HIGH");
        MIN_PAYOUT = _min_payout;
    }

    /// @dev When covers must be calculated and transfered to delegators, the respective collator can refund the oracle that pushedData the tx fees for that calculation
    /// @param _refundOracleGasPrice The gas price used to calculate the refund
    function setRefundOracleGasPrice(uint256 _refundOracleGasPrice)
        external
        auth(ROLE_MANAGER)
    {
        require(_refundOracleGasPrice <= 10_000_000_000, "INV_PRICE"); // TODO change for Moonbeam
        // for market values, check https://moonbeam-gasinfo.netlify.app/
        refundOracleGasPrice = _refundOracleGasPrice;
    }

    /// @dev ForceUndelegate can only be called on a limited frequency to avoid spamming the contract and liquidating all funds unecessarilly
    /// @param _eras_between_forced_undelegation the number of rounds that must pass to be able to call forceUndelegate again
    function setErasBetweenForcedUndelegations(
        uint128 _eras_between_forced_undelegation
    ) external auth(ROLE_MANAGER) {
        // Protect contract from multiple undelegations without allowing time to unbond
        require(_eras_between_forced_undelegation <= 300, "HIGH");
        ERAS_BETWEEN_FORCED_UNDELEGATION = _eras_between_forced_undelegation;
    }

    /// ***************** GETTERS *****************

    function getMember(address member)
        external
        view
        returns (
            bool,
            bool,
            uint256,
            uint256,
            uint256,
            uint128,
            uint128,
            uint128
        )
    {
        Member memory m = members[member];
        return (
            m.isMember,
            m.active,
            m.deposit,
            m.maxDefaulted,
            m.maxCoveredDelegation,
            m.lastPushedEra,
            m.noZeroPtsCoverAfterEra,
            m.noActiveSetCoverAfterEra
        );
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

    function getErasCovered(address member) external view returns (uint128) {
        return erasCovered[member];
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    /// ***************** FUNCTIONS CALLABLE ONLY BY OTHERS CONTRACTS *****************

    /// @dev The method is used by the oracle to push data into the contract and calculate potential cover claims.
    /// Cover claims are not transfered to delegators; instea, they are credited as sums to a mapping and can be transfered later in a separate tx.
    /// This is necessary to keep the method under the gas limit and to also save tx costs by not executing imaterial transfers.
    /// @param _eraId The round number
    /// @param _report The collator data, including authored block counts, delegators, etc.
    function pushData(
        uint128 _eraId,
        Types.OracleData calldata _report,
        address _oracle
    ) external onlyOracle {
        // we allow reporting the same era more than once, because oracles may split the report to pieces if many collators miss rounds
        // this is required because each pushData cannot handle more than 500 delegator payouts
        require(_isLastCompletedEra(_eraId), "INV_ERA");
        // require(_eraId >= eraId, "OLD_ERA");
        eraId = _eraId;

        for (uint256 i = 0; i < _report.collators.length; i++) {
            uint256 startGas = gasleft();
            Types.CollatorData calldata collatorData = _report.collators[i];
            // a member report may only be pushed once per era
            require(
                _eraId > members[collatorData.collatorAccount].lastPushedEra,
                "OLD_MEMBER_ERA"
            );
            members[collatorData.collatorAccount].lastPushedEra = _eraId;
            members[collatorData.collatorAccount]
                .lastDelegationsTotall = collatorData.delegationsTotal;

            if (
                !members[collatorData.collatorAccount].isMember ||
                !members[collatorData.collatorAccount].active
            ) {
                continue; // not a member or not active
            }

            _updateErasCovered(
                collatorData.collatorAccount,
                collatorData.delegationsTotal
            );

            bool mustPay;
            uint128 noActiveSetCoverAfterEra = members[
                collatorData.collatorAccount
            ].noActiveSetCoverAfterEra;
            if (
                // check that member is offering active-set cover;
                // if noActiveSetCoverAfterEra is a positive number, then the member will stop offering cover after noActiveSetCoverAfterEra + erasCovered
                (noActiveSetCoverAfterEra == 0 ||
                    noActiveSetCoverAfterEra +
                        erasCovered[collatorData.collatorAccount] >
                    eraId) &&
                // collator must not be in the active set
                !collatorData.active
            ) {
                // if collator is out of the active set
                emit MemberNotActiveEvent(collatorData.collatorAccount, eraId);
                mustPay = true;
            }
            uint128 noZeroPtsCoverAfterEra = members[
                collatorData.collatorAccount
            ].noZeroPtsCoverAfterEra;
            if (
                // check that member is offering zero-points cover;
                // if noZeroPtsCoverAfterEra is a positive number, then the member will stop offering cover after noZeroPtsCoverAfterEra + erasCovered
                (noZeroPtsCoverAfterEra == 0 ||
                    noZeroPtsCoverAfterEra +
                        erasCovered[collatorData.collatorAccount] >
                    eraId) &&
                // collator must be in the active set and have reported 0 points for this era
                collatorData.active &&
                collatorData.points == 0
            ) {
                // if collator is in the active set but produced 0 blocks
                emit MemberHasZeroPointsEvent(
                    collatorData.collatorAccount,
                    eraId
                );
                mustPay = true;
            }
            if (!mustPay) {
                continue;
            }

            // this loop may run for 300 times so it must stay optimized and light
            for (
                uint128 j = 0;
                j < collatorData.topActiveDelegations.length;
                j++
            ) {
                Types.DelegationsData calldata delegationData = collatorData
                    .topActiveDelegations[j];

                uint256 toPay = delegationData.amount >
                    members[collatorData.collatorAccount].maxCoveredDelegation
                    ? (STAKE_UNIT_COVER *
                        members[collatorData.collatorAccount]
                            .maxCoveredDelegation) / 1 ether
                    : (STAKE_UNIT_COVER * delegationData.amount) / 1 ether;

                if (members[collatorData.collatorAccount].deposit < toPay) {
                    members[collatorData.collatorAccount].maxDefaulted = toPay >
                        members[collatorData.collatorAccount].maxDefaulted
                        ? toPay
                        : members[collatorData.collatorAccount].maxDefaulted;
                    continue; // TODO change to break
                    // we could, potentially, make more smaller payments, but this risks the TX reversing due to high gas cost
                }

                payoutAmounts[delegationData.ownerAccount] += toPay; // credit the delegator
                members[collatorData.collatorAccount].deposit -= toPay; // debit the collator deposit
                membersDepositTotal -= toPay; // decrease the total members deposit
                coverOwedTotal += toPay; // current total (not paid out)
            }

            // Refund oracle for gas costs. Calculating cover claims for every delegator can get expensive for 300 delegators.
            // Oracles pay some minor tx fees when they submit a report, but they get reimusrsed for the calculation of the claims when that happens.
            // This is not only fair but also necessary because only 1 oracle will have to run pushData per eraNonce (the oracle that happens to be the Nth one in an N-quorum)
            // If the oracle is not reimbursed, then there is an incentive to not be the Nth oracle to avoid the fee.
            if (refundOracleGasPrice > 0 && _oracle != address(0)) {
                uint256 gasUsed = startGas - gasleft();
                uint256 refund = gasUsed * refundOracleGasPrice;
                if (members[collatorData.collatorAccount].deposit > refund) {
                    members[collatorData.collatorAccount].deposit -= refund;
                    payoutAmounts[_oracle] += refund;
                }
            }
        }
        emit ReportPushedEvent(eraId, _oracle);
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
        staking.delegatorBondMore(candidate, more);
    }

    function schedule_delegator_bond_less(address candidate, uint256 less)
        external
        virtual
        onlyDepositStaking
    {
        staking.scheduleDelegatorBondLess(candidate, less);
    }

    function schedule_delegator_revoke(address candidate)
        external
        virtual
        onlyDepositStaking
    {
        staking.scheduleRevokeDelegation(candidate);
    }

    function resetNotPaid() external onlyDepositStaking {
        memberNotPaid = address(0);
        delegatorNotPaid = address(0);
    }

    /// ***************** INTERNAL FUNCTIONS *****************

    /** @dev Private method for scheduling a withdrawal of cover funds by a member. Can only be called by the
    collator itself. Only one scheduled decrease can exist per member at a time. The waiting time to withdraw is
    proportional to the deposit. This is to protect delegators. For exaple, if a member's deposit provides cover
    for 3 months, delegators should be able to assume that even if that member schedules a decrease tomorrow,
    they would still be protected for enother 3 months.
     @param amount The amount to decrease the cover deposit by.
     @param member The member to refund their deposit to.
    */
    function _scheduleDecreaseCover(uint256 amount, address member) private {
        require(amount > 0, "ZERO_DECR");
        require(members[member].deposit > 0, "NO_DEP");
        require(members[member].deposit >= amount, "EXC_DEP");
        require(scheduledDecreasesMap[msg.sender].amount == 0, "DECR_EXIST");
        scheduledDecreasesMap[member] = ScheduledDecrease(_getEra(), amount);
        emit DecreaseCoverScheduledEvent(member, amount);
    }

    function _getFreeBalance() private view returns (uint256) {
        // The method returns the current free balance (reducible + locked), but it excludes funds
        // in unlocking (soon to be reducible)
        return
            address(this).balance +
            DepositStaking(DEPOSIT_STAKING).stakedTotal(); // reducible + (staked + being_unstaked)
    }

    function _getEra() internal view virtual returns (uint128) {
        return uint128(staking.round());
    }

    function _isLastCompletedEra(uint128 _eraId)
        internal
        view
        virtual
        returns (bool)
    {
        return _getEra() - _eraId == 1;
    }

    function _updateErasCovered(address _member, uint256 _delegationsTotal)
        internal
    {
        if (_delegationsTotal == 0) {
            erasCovered[_member] = 8;
            return;
        }
        // the larger the deposit, the longer the waiting period for decreasing it
        uint256 refundPerEra = (_delegationsTotal * STAKE_UNIT_COVER) / 1 ether;
        uint128 erasCov = uint128(members[_member].deposit / refundPerEra);
        erasCovered[_member] = erasCov <= 1080 ? erasCov : 1080; // max 3 months TODO change for Moonbeam
    }

    function _isMemberAuth(address _caller, address _member)
        internal
        view
        returns (bool)
    {
        return
            whitelisted[_member] == _caller ||
            _isProxyOfSelectedCandidate(_caller, _member);
    }

    function _isProxyOfSelectedCandidate(address _signer, address _collator)
        internal
        view
        virtual
        returns (bool)
    {
        bool isCollator = staking.isSelectedCandidate(_collator);
        bool isProxy = proxy.isProxy(
            _collator,
            _signer,
            IProxy.ProxyType.Governance,
            0
        );
        return isCollator && isProxy;
    }

    receive() external payable {}
}
