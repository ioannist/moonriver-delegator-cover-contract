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
    event ReportPushedEvent(uint128 eraId, address oracleCollator);
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
    // Maximum era payout
    uint256 public MAX_ERA_MEMBER_PAYOUT;

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
    uint256 public payoutsOwedTotal;
    // The number of eras each member covers (forecast)
    // this is also the number of eras a member must wait to execute a decrease request
    mapping(address => uint128) public erasCovered;
    // map of delegators to amounts owed by collators
    mapping(address => uint256) public payoutAmounts;
    // map of total payouts to delegators
    mapping(address => uint256) public totalPayouts;
    // If not 0, the oracle is credited with the tx cost for caclulating the cover payments
    uint256 refundOracleGasPrice;
    // If set to true, collators don't need whitelisting and can join/deposit funds from a Governance proxy
    bool noManualWhitelistingRequired;

    /* If a collator cannot withdraw their funds due to the funds being locked in staking, their address is
    recorded in memberNotPaid .This will prohibit the manager from bonding more until that collator is paid
    by forcing undelegate
    */
    address public memberNotPaid;
    // Same as above for delegators who cannot claims their cover due to funds being locked
    address public delegatorNotPaid;

    //
    uint256 memberFee;
    //
    uint128 membersInvoicedLastEra;

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
     @notice Initialize contract.
     @dev Can only be called once and should be called right after contract deployment
     */
    function initialize(
        address _auth_manager,
        address _oracle_master,
        address _deposit_staking,
        uint256 _min_deposit,
        uint256 _max_deposit_total,
        uint256 _stake_unit_cover,
        uint256 _min_payout,
        uint256 _max_era_member_payout,
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
        MAX_ERA_MEMBER_PAYOUT = _max_era_member_payout;
        ERAS_BETWEEN_FORCED_UNDELEGATION = _eras_between_forced_undelegation;
    }

    /// ***************** MEMBER (COLLATOR) FUNCS *****************

    /**
    @notice Deposit cover funds for a member collator
    @dev Collators can start offering cover to their delegators by making a cover deposit larger than the MIN_DEPOSIT.
    The covererage period offered (ad advertised at stakemovr.com and stakeglmr.com) is calculated based on the size of the deposit.
    Collators can deposit more funds or schedule a withdrawal at any time.
    If noManualWhitelistingRequired  is true, then the caller must be a Gov proxy of the collator member address.
    If noManualWhitelistingRequired is false, i.e. whitelisting IS required, then the caller must be already whitelisted by the contract manager.
    If the collator has defaulted in making a cover payment, then they must deposit at least the defualetd amount.
    A succesful deposit will enroll the collator (member.isMember=true) but it will only activate cover (member.active=true) if the total deposit is larger than MIN_DEPOSIT.
    @param _member The collator address the deposit is for. The caller of the depositCover method is not the member/collator address
    (the collator address should be kept in cold storage and not sued for contract interactions). The caller is wither manually whitelisted address,
    or a Gov proxy of the collator address. This is why the method has to provider the collator address in the _member field.
    */
    function depositCover(address _member) external payable {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
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

        members[_member].deposit += msg.value;
        if (members[_member].deposit >= MIN_DEPOSIT) {
            members[_member].active = true;
        }
        delete members[_member].maxDefaulted;
        membersDepositTotal += msg.value;
        emit DepositEvent(_member, msg.value);
    }

    /**
    @notice Schedule a deposit decrease that can be executed in the future
    @dev A member can request to withdraw its cover funds. The member has to wait for a number of rounds
    until they can withdraw. During this waiting time, their funds continue to cover their delegators.
    @param _member the collator member the calling address represents. Do not use the collator account to interact with this contract.
    @param _amount how much to decrease the cover by.
    */
    function scheduleDecreaseCover(address _member, uint256 _amount) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        _scheduleDecreaseCover(_amount, _member);
    }

    /**
    @notice Cancel a scheduled cover decrease (withdrawal)
    @dev Members can cancel a scheduled deposit decrease while it is still pending.
    The cancellation will take effect immediately, which will result in changes in the advertised cover offering at stakemovr.com
    */
    function cancelDecreaseCover(address _member) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        require(members[_member].deposit > 0, "NO_DEP");
        require(scheduledDecreasesMap[_member].amount > 0, "DECR_N_EXIST");
        // Reset memberNotPaid to 0 if it was set to this collator, otherwise leave as is.
        // Anybody can execute a scheduled member withdrawal on their behalf, but only the member can cancel its request.
        // Therefore, it is necessary to reset memberNotPaid on cancellation, to avoid a stuck non-zero membernotPaid value.
        if (memberNotPaid == _member) {
            memberNotPaid = address(0);
        }
        delete scheduledDecreasesMap[_member];
        emit CancelDecreaseCoverEvent(_member);
    }

    /**
    @notice Set the maximum delegation that this collator covers (per single delegation). Any amount above this will only be covered up to the max.
    @dev Members can choose to protect delegations up to a specific amount (this might incentivize delegators to spread their stake among collators)
    A delegator can circumvent this by using multiple delegator addresses if they really want to delegate all their funds with one collator and sitll be covered.
    Member must be active to edit this parameter. Memebr are not allowed to set a max below 500 to avoid abuse. To disable this limit, the member
    can set maxCoveredDelegation to a very high number.
    @param _max_covered the max delegation that is covered (any amount above that will not receive cover only up to the max amount)
    */
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

    /**
    @notice Memebrs can set the type of cover offered to their delegators
    @dev Members can protect their delegators against them going down (zero points) or out (not in active set) or both.
    At least one cover type is required. The change becomes effective after a number of eras have passed to protect delegators.
    The delay period is different for each member and it depends on the cover duration, i.e. erasCovered (which depends on deposit).
    The method stores the era in which a type of cover was disabled and applies it (or not) in future eras based on what the
    erasCovered value is for that member on that era.
    @param _noZeroPtsCoverAfterEra false if you want to cover zero-point rounds (down), true if you want to disbale that cover type
    @param _noActiveSetCoverAfterEra false if you want to cover being kicked out of the active set (out), true if you want to disable that cover type
    */
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

    /**
    @notice A member can authorize the transfer of its collator cover managerment rights to another address
    @dev A member might want to use a different address to manage its collator cover. This method allows
    to tarnsfer the management rights which also immediately removes those rights from the previous address (caller).
    A Gov proxy account can also use this method to authorize another addres (not a Gov proxy) to manage its collator cover.
    Only one such authorized address can exist for a collator at a time. However, obviously multiple Gov proxy addresses can exist,
    with the same access rights to managing cover. Authorizing the 0x0 address, disables non-proxy authorization
    for that member, and can only be undone by the manager by whitelisting again.
     */
    function transferMemberAuth(address _member, address proxyAccount) external {
        require(_isMemberAuth(msg.sender, _member), "N_COLLATOR_PROXY");
        whitelisted[_member] = proxyAccount;
    }

    /// ***************** MEMBER FUNCS THAT CAN BE CALLED BY ANYBODY *****************

    /**
    @notice Execute a scheduled cover decrease (withdrawal) by a member
    @dev Anybody can execute a matured deposit decrease request of a member.
    For the request to be mature/executable, a number of eras must have passed since the request was made.
    This "delay period" is different for every member and depends on that memebrs total deposit (the larger the deposit, the longer the period).
    Since a deposit can be increase, it can be the case that a matured decrease request becomes imature again if it is not executed.
    The method also records defaults in paying members by updating the memberNotPaid value. Should a default be recorded,
    no other default will be recorded until that default is resolved. A default limits the staking manager's ability
    to delegate or bondMore of the contract's liquid funds.
    @param _member The collator member whose scheduled withdrawal we are executing (anybody can execute it)
    */
    function executeScheduled(address payable _member) external {
        require(scheduledDecreasesMap[_member].amount != 0, "DECR_N_EXIST");
        require(
            // The current era must be after the era the decrease is scheduled for
            scheduledDecreasesMap[_member].era + erasCovered[_member] <=
                _getEra(),
            "NOT_EXEC"
        );

        uint256 amount = scheduledDecreasesMap[_member].amount;
        // Check if contract has enough reducible balance (may be locked in staking)
        if (address(this).balance < amount) {
            // Only update if not already set
            // This means that memberNotPaid will always store the first member that was not paid and only that member,
            // until they are paid (anybody can execute payment if funds are liquid) or until they cancel their decrease
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

    /** 
    @notice Pays out the accumulated delegator rewards claims to the given delegators.
    @dev Calling this method will result to the supplied delegators being paid the cover claims balance they are owed.
    A positive balance may have resulted from multiple roun covers, or even from multiple collators.
    If a payment default is recorded, the delegatorNotPaid state variable is set. Subsequent defaults will not update that value.
    Therefore, the delegator that was not paid must be paid for the variable to clear and to unblock the staking manager from
    delegating or bonding more. A default does not block other delegators from getting payouts.
    The method can be called by anybody (similar to Moonbeam's execute delegation decrease).
    This is required, so that (for example), the manager can initiate a previously defaulted payment to reset delegatorNotPaid and disable forceScheduleRevoke.
    The function can be called with multiple delegators for saving gas costs.
    @param delegators The delegators to pay cover claims to. These are accumulated claims and could even be from multiple collators.
    */
    function payOutCover(address payable[] calldata delegators) external {
        uint256 toPayTotal;
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
            toPayTotal += toPay;
            totalPayouts[delegator] += toPay;
            emit PayoutEvent(delegator, toPay);

            (bool sent, ) = delegator.call{value: toPay}("");
            require(sent, "TRANSF_FAIL");
        }
        payoutsOwedTotal -= toPayTotal; // debit the total cover owed
    }

    /**
    @dev Anybody can execute anybody's delegation request in Moonbeam/Moonriver, so this method is not required.
    However, we include this method in case Moonbeam changes the execute permissions in the future.
    @param candidate the collator that the contract is revoking from or decreasing its delegation to
    */
    function executeDelegationRequest(
        address candidate
    ) external {
        staking.executeDelegationRequest(address(this), candidate);
    }

    /**
    @notice Invoices active members and credits oracles
    @dev Cover members are charged a fee every 84 rounds (1 week). Members can wave this fee by running an oracle.
    The collected fees from all non-oracle running members, are equally split and credited to oracle-running members.
    We directly debit the deposits of the oracle-running members, which means that the deposits of oracle-running members
    will grow over time (assuming zero cover claims).
    The purpose of the fee is to incentivize collators to run oracles, thereby increasing the security of the contract.
    The manager will experiment with setting the fee to a value that incentivizes enough collators to run oracles,
    without discouraging the collators that cannot run oracles from using the contract.
    */
    function invoiceCollators() external {
        uint128 eraNow = _getEra();
        require(eraNow > membersInvoicedLastEra, "ALREADY_INVOICED");
        require(eraNow % 84 == 0, "ERA_INV"); // can only charge fee every 84 eras, TODO change in Moonbeam
        uint256 length = memberAddresses.length;
        uint256 totalFee;
        uint256 membersWithOracles; // a bitmap with 1's in the members indices of members that have oracle points getOraclePointBitmap(memberAddress) > 0
        uint256 membersWithOraclesCount;

        // debit non-oracle-running members
        for(uint256 i; i < length; i++) {
            address memberAddress = memberAddresses[i];
            // If the collator is active AND it is not participating as an oracle, then charge it
            if (members[memberAddress].active) {
                if (IOracleMaster(ORACLE_MASTER).getOraclePointBitmap(memberAddress) == 0) {
                    if ( members[memberAddress].deposit < memberFee) {
                        // by setting active = false, we force the collator to have to meet MIN_DEPOSIT again to reactivate (should be enough to cover memberFee)
                        // we don't set maxDefaulted to memberFee, because maxDefaulted is meant for delegator payment defaults that are more important and nearly always larger
                        // defaulted amounts are written off and not paid even if the member becomes active again
                        members[memberAddress].active = false;
                        continue;
                    }
                    members[memberAddress].deposit -= memberFee;
                    totalFee += memberFee;
                } else {
                    // Set the bitmap's bit to 1 so we don't have to call getOraclePointBitmap again in the next iteration for crediting oracles
                    membersWithOracles = membersWithOracles | (1 << i);
                    membersWithOraclesCount++;
                }
            }
        }

        // credit oracle-running members
        uint256 oraclePayment = totalFee / membersWithOraclesCount;
        for(uint256 i; i < length; i++) {
            if (membersWithOracles & (1 << i) == 1) {
                members[memberAddresses[i]].deposit += oraclePayment;
            }
        }
        // because all we are doing is moving deposits around, we don't need to update membersDepositTotal or payoutsOwedTotal
        membersInvoicedLastEra = eraNow;
    }

    /// ***************** MANAGEMENT FUNCTIONS *****************

    /**
    @dev Allows the manager to withdraw any contract balance that is above the total deposits balance.
    This includes contract staking rewards or other funds that were sent to the contract outside the deposit function.
    The method checks that the funds are over and above total deposits by keeping track of 4 values:
    A) contract balance, that is the reducible balance visible to the EVM (this is maintained automatically)
    B) totalStaked, that is the amount currently staked and NOT pending decrease or revoke (mainteined by the contract logic)
    C) membersDepositTotal, this is the total deposits of all members that have NOT been claimed;
    any pending deposit decreases (not executed) do not reduce total deposits (vs. totalStaked decereases that DO reduce totalStaked)
    D) payoutsOwedTotal this are the member deposits that have been moved to the delegator payables account, i.e. funds owed to the delegators due to cover claims
    The manager can then withdraw any amount < (A + B) - (C + D), i.e. any extra funds that now owed to delegators or members.
    Since A + B does not include funds pending decrease or revoke (let that be E), the manager's capcity to withdraw is reduced by E
    @param amount How much to withdraw
    @param receiver Who to send the withdrawal to
    */
    function withdrawRewards(
        uint256 amount,
        address payable receiver
    ) external auth(ROLE_MANAGER) {
        // The contract must have enough non-locked funds
        require(address(this).balance > amount, "NO_FUNDS");
        // The check below may result in a false negative (reject withdrawal even though there are extra funds) for E > 0 (see @dev\Vv)
        require(
            _getFreeBalance() - amount > membersDepositTotal + payoutsOwedTotal,
            "NO_REWARDS"
        );
        (bool sent, ) = receiver.call{value: amount}("");
        require(sent, "TRANSF_FAIL");
    }

    /**
    @notice Manager can whitelist collators to allow them to deposit funds and activate cover
    @dev The method saves a proxy account (representative account) and a collator account that the proxy represents.
    Collators cannot authorize actions with their collator account for security reasons, i.e. they should not use their
    collator account to interact with any smart contracts.
    If noManualWhitelistingRequired is true, then collators will be able to authorize actions using a Gov proxy of their collator.
    We say "WILL be able" because, currently, smart contracts cannot access the proxy precompile, so proxy authorization does not work.
    If noManualWhitelistingRequired is false, then the address MUST be whitelisted to authorize actions on behalf of the collator.
    A collator must be whitelisted to make a deposit and to start offering cover.
    @param _member the collator address that this account will represent
    @param proxyAccount the proxy or representative account that represents the collator; this is not to be confused with the Gov proxy
    */
    function whitelist(
        address _member,
        address proxyAccount
    ) external auth(ROLE_MANAGER) {
        require(whitelisted[_member] == address(0), "ALREADY_WHITELISTED");
        whitelisted[_member] = proxyAccount;
    }

    /**
    @notice Set the minimum member deposit required
    @dev if a collator has not deposited the minimum ammount, then its active flag is false. Inactive collators cannot execute several member methods.
    @param _min_deposit the min total deposit that is needed to activate cover offering
    */
    function setMinDeposit(uint256 _min_deposit) external auth(ROLE_MANAGER) {
        MIN_DEPOSIT = _min_deposit;
    }

    /**
    @notice Set the maximum total deposit. Member collators cannot deposit more than this total amount.
    @dev Setting a max total deposit puts a limit to how many days worth of cover collators can provide to their delegators.
    This is to avoid a never-ending competition of increasing cover offerings that don't offer real world value.
    @param _max_deposit_total The max deposit allowed
    */
    function setMaxDepositTotal(
        uint256 _max_deposit_total
    ) external auth(ROLE_MANAGER) {
        MAX_DEPOSIT_TOTAL = _max_deposit_total;
    }

    /**
    @dev Manager can override the erasCovered value of a member temporarilly. This is temporary, because the
    value will be overwritten again in the next pushData or member deposit.
    @param _erasCovered The decrease execution delay
    */
    function setErasCovered(
        uint128 _erasCovered,
        address member
    ) external auth(ROLE_MANAGER) {
        // Cannot set delay to longer than 3 months (12 rounds per day * 30 * 3)
        require(_erasCovered <= 1080, "HIGH");
        erasCovered[member] = _erasCovered;
    }

    /**
    @notice Sets the cover refund (in Wei) given to delegators for every 1 ETH (MOVR) staked per round
    @dev The cover contract offers the same cover for every token delegated, for all collators. This means that collators pay the same
    amount per delegated token to their delegators. The more delegations a collator has, the more they will have to pay out.
    The manager is responsible for setting the stake unit cover to a value based on the average APR and updaitng it from time to time.
    If a collator is offering above average APR, then its delegators will be underpaid; and vice versa.
    This should not be a problem as most collators tend to offer similar APRs with the exception of some whale-backed collators.
    @param _stake_unit_cover the unit cover
    */
    function setStakeUnitCover(
        uint256 _stake_unit_cover
    ) external auth(ROLE_MANAGER) {
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

    /**
    @notice Sets the minimum amount that a delegator can claim from accumulated covers
    @dev Delegation cover rewards can be very low if the delegaiton amount is low. This method allows to set a minimum
    claimable cover so as to help delegators execute reasonable claim transactions.
    @param _min_payout the min payout amount
    */
    function setMinPayout(uint256 _min_payout) external auth(ROLE_MANAGER) {
        // Protect delegators from having to wait forever to get paid due to an unresonable min payment
        require(_min_payout <= 1 ether, "HIGH");
        MIN_PAYOUT = _min_payout;
    }

    /**
    @notice When covers must be calculated and transfered to delegators, the respective collator can refund the oracle that pushedData the tx fees for that calculation
    @dev Contarct transaciton fees are relatively low when there are no claims to compute. This means that, most of the time, oracles
    can agree that there is nothing to do, for little gas. However, when a collators misses a round, the oracle that happens to complete the quorum,
    has to pay for calculating all the delegator claims. This is a loop that can run up to 300 times, resulting to higher gas costs.
    In those cases, the gas costs for the loop are refunded to the oracle by the collator that missed that round.
    The refund is not transfered but rather, credited to the oracle's delegator cover account. The oracle can then request a payout.
    @param _refundOracleGasPrice The gas price used to calculate the refund
    */
    function setRefundOracleGasPrice(
        uint256 _refundOracleGasPrice
    ) external auth(ROLE_MANAGER) {
        require(_refundOracleGasPrice <= 10_000_000_000, "INV_PRICE"); // TODO change for Moonbeam
        // for market values, check https://moonbeam-gasinfo.netlify.app/
        refundOracleGasPrice = _refundOracleGasPrice;
    }

    /**
    @notice Set how often forced revokes can take place
    @dev forceScheduleRevoke can only be called on a limited frequency to avoid spamming the contract and liquidating all funds unecessarilly.
    Anybody can call forceScheduleRevoke if the contract has defaults in making a payment to a member or delegator. Defaults are possible
    because the contract may stake its funds, thereby reducing its reducible balance that is available to make payments. Forcing a revoke
    will allow funds to be returned to the reducible balance after N rounds. Therefore, the manager should set ERAS_BETWEEN_FORCED_UNDELEGATION
    to a value that is > N to allow for the unstaked funds to clear the defaults.
    @param _eras_between_forced_undelegation the number of rounds that must pass to be able to call forceUndelegate again
    */
    function setErasBetweenForcedUndelegations(
        uint128 _eras_between_forced_undelegation
    ) external auth(ROLE_MANAGER) {
        // Protect contract from multiple undelegations without allowing time to unbond
        require(_eras_between_forced_undelegation <= 300, "HIGH");
        ERAS_BETWEEN_FORCED_UNDELEGATION = _eras_between_forced_undelegation;
    }

    /**
    @notice Set a limit to how much cover can be credited to delegators for a collator for one missed round
    @dev Cover amounts are calculated based on the values provided by the oracle quorum. Therefore, a malicious quorum could direct funds
    to addresses that are not entitled to any cover. This is unlikely as it requires a large number of collator orcales colluding, and that StakeBaby
    fails to exercise its veto power on quorum reports. In any case, MAX_ERA_MEMBER_PAYOUT is a last-defense security measure, should everything else fail.
    By placing a sensical limit to the max round payout, we can limit the damage done by limiting the rate of funds outflow and giving the
    manager the opportunity to detect the situaiton and pause oracle reporting.
    */
    function setMaxEraMemberPayout(uint256 _max_era_member_payout) external auth(ROLE_MANAGER) {
        MAX_ERA_MEMBER_PAYOUT = _max_era_member_payout;
    }

    /**
    @notice See deposit cover and whitelist for an explanation of noManualWhitelistingRequired
    @param _noManualWhitelistingRequired true when we want to allow members to manage their accounts using a Gov proxy, false when we require manual whitelisting
    */
    function setNoManualWhitelistingRequired(bool _noManualWhitelistingRequired) external auth(ROLE_MANAGER) {
        noManualWhitelistingRequired = _noManualWhitelistingRequired;
    }

    /// ***************** GETTERS *****************

    function getMember(
        address member
    )
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

    function getScheduledDecrease(
        address member
    ) external view returns (uint128, uint256) {
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

    /**
    @notice The method is used by the oracle to push data into the contract and calculate potential cover claims.
    @dev Cover claims are not transfered to delegators; instead, they are credited as sums to a mapping and can be transfered later in a separate tx.
    Cover claims are credited only if the collator offers the appropriate type of cover for the occation. For example, a collator that
    offers only active-set cover, will not credit its delegators if it has missed a rounf because its server was down.
    The method also:
    A) updates the coveredEras value for a collator, given the latest total backing.
    B) sets the delegatoNotPaid flag if a default happens
    C) credits a gas fee refund to the oracle if claim covers are clculated
    @param _eraId The round number
    @param _report The collator data, including authored block counts, delegators, etc.
    */
    function pushData(
        uint128 _eraId,
        Types.OracleData calldata _report,
        address _oracleCollator
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

            // this loop may run for 300 times so it must be optimized
            uint256 toPayTotal;
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
                    // delegations are sorted lowest->highest, so tha max default is the last delegation
                    members[collatorData.collatorAccount].maxDefaulted =
                        collatorData.topActiveDelegations[collatorData.topActiveDelegations.length - 1].amount;
                    // because delegations are sorted lowest-> highest, we know that we have paid as many delegators as possible before defaulting
                    members[collatorData.collatorAccount].active = false;
                    // defaulted amounts are written off and not paid if the member becomes active again
                    break;
                }

                payoutAmounts[delegationData.ownerAccount] += toPay; // credit the delegator
                members[collatorData.collatorAccount].deposit -= toPay; // debit the collator deposit
                toPayTotal += toPay;
            }
            require(toPayTotal <= MAX_ERA_MEMBER_PAYOUT, "EXCEEDS_MAX_ERA_MEMBER_PAYOUT");
            membersDepositTotal -= toPayTotal; // decrease the total members deposit
            payoutsOwedTotal += toPayTotal; // current total (not paid out)

            // Refund oracle for gas costs. Calculating cover claims for every delegator can get expensive for 300 delegators.
            // Oracles pay some minor tx fees when they submit a report, but they get reimusrsed for the calculation of the claims when that happens.
            // This is not only fair but also necessary because only 1 oracle will have to run pushData per eraNonce (the oracle that happens to be the Nth one in an N-quorum)
            // If the oracle is not reimbursed, then there is an incentive to not be the Nth oracle to avoid the fee.
            if (refundOracleGasPrice > 0 && _oracleCollator != address(0)) {
                uint256 gasUsed = startGas - gasleft();
                uint256 refund = gasUsed * refundOracleGasPrice;
                if (members[collatorData.collatorAccount].deposit < refund) {
                    // by setting active= false, the member has to reach the MIN_DEPOSIT again to reactive which is more than enough to cover the refund
                    // we don't see maxDefaulted value here, cause this is meant for delegator payment defaults that are more important
                    members[collatorData.collatorAccount].active = false;
                    // defaulted amounts are written off and not paid if the member becomes active again
                    continue;
                }
                members[collatorData.collatorAccount].deposit -= refund;
                members[_oracleCollator].deposit += refund;
                // because we are only moving funds from one deposit to another, we don't need to update membersDepositTotal or payoutsOwedTotal
            }
        }
        emit ReportPushedEvent(eraId, _oracleCollator);
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

    function delegator_bond_more(
        address candidate,
        uint256 more
    ) external virtual onlyDepositStaking {
        staking.delegatorBondMore(candidate, more);
    }

    function schedule_delegator_bond_less(
        address candidate,
        uint256 less
    ) external virtual onlyDepositStaking {
        staking.scheduleDelegatorBondLess(candidate, less);
    }

    function schedule_delegator_revoke(
        address candidate
    ) external virtual onlyDepositStaking {
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

    function _isLastCompletedEra(
        uint128 _eraId
    ) internal view virtual returns (bool) {
        return _getEra() - _eraId == 1;
    }

    /**
    @dev The eras covered value signifies several things:
    A) how many eras it takes to change the cover duration, after a change is requested (via deposit withdrawal request)
    B) how many eras it takes to apply any cover type changes
    C) how many eras it takes to be able to execute a member deposit withdrawal
    The reason these values are equivalent, is that the cover period is deduced directly from the total deposit amount,i.e.
    the larger the deposit, the more eras/days are covered, and the loonger the cover period is.
    @param _member the member that we are setting erasCovered for
    @param _delegationsTotal the last known value of total backing for that member
    */
    function _updateErasCovered(
        address _member,
        uint256 _delegationsTotal
    ) internal {
        if (_delegationsTotal == 0) {
            erasCovered[_member] = 8;
            return;
        }
        // The larger the total backing (delegationsTotal), the more cover the collator will owe if it misses a round (refundPerEra)
        uint256 refundPerEra = (_delegationsTotal * STAKE_UNIT_COVER) / 1 ether;
        // The more the collator must pay (refundPerEra), the shorter the cover period.
        // The larger the deposit, the longer the cover period.
        uint128 erasCov = uint128(members[_member].deposit / refundPerEra);
        erasCovered[_member] = erasCov <= 1080 ? erasCov : 1080; // max 3 months TODO change for Moonbeam
    }

    /**
    @dev A member can be authorized in two ways
    A) manually whitelisted by the manager, and
    B) by being a Gov proxy of the collator it represents (requires that noManualWhitelistingRequired = true, and Moonbeam to enable smart contract calls to proxy precompile)
    */
    function _isMemberAuth(
        address _caller,
        address _member
    ) internal view returns (bool) {
        return
            whitelisted[_member] == _caller ||
            (noManualWhitelistingRequired && _isProxyOfSelectedCandidate(_caller, _member));
    }

    /**
    @notice Returns true if the signer is a Gov proxy of the collator, and the collator is a selected candidate
    @dev used by auth method to check if the caller has been authorized as a proxy by an active-set collator
    */
    function _isProxyOfSelectedCandidate(
        address _signer,
        address _collator
    ) internal view virtual returns (bool) {
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
