// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma abicoder v2;

import "../interfaces/IAuthManager.sol";
import "./InactivityCover.sol";
import "../interfaces/StakingInterface.sol";

contract DepositStaking {
    struct Delegation {
        bool isDelegated;
        uint256 amount;
    }

    event ForceRevokeEvent(uint128 eraId, address collator);
    event DelegatorBondMoreEvent(address collator, uint256 amount);
    event DelegatorBondLessEvent(address collator, uint256 amount);
    event RevokeEvent(address collator);
    event DelegateEvent(address collator, uint256 amount);

    /// The ParachainStaking wrapper at the known pre-compile address. This will be used to make all calls to the underlying staking solution
    ParachainStaking public staking;

    /// Auth manager contract address
    address public AUTH_MANAGER;

    /// Inactivity cover contract address
    address payable public INACTIVITY_COVER;

    /// Variables for staking this contract's funds to generate income
    /// Total staked by this contract
    uint256 public stakedTotal;

    /// Addresses of collators this contract has delegated to
    address[] internal collatorsDelegated;

    /// Collator address, and delegation amount by this contract
    mapping(address => Delegation) public delegations;

    /// Last era that a forced undelegaton was requested
    uint128 public lastForcedUndelegationEra;

    /// Max percentage of contract balance that can be staked; controlled by manager, imposed on staking-manager
    uint256 public maxPercentStaked = 100;

    address contractV2;

    /// Manager role
    bytes32 internal constant ROLE_MANAGER = keccak256("ROLE_MANAGER");

    /// Stakign manager can stake/unstake contract funds
    bytes32 internal constant ROLE_STAKING_MANAGER =
        keccak256("ROLE_STAKING_MANAGER");

    /// Allows function calls only from member with specific role
    modifier auth(bytes32 role) {
        require(IAuthManager(AUTH_MANAGER).has(role, msg.sender), "UNAUTH");
        _;
    }

    /**
     Initialize contract
     @dev called only once right after contract is deployed
     */
    function initialize(
        address _auth_manager,
        address payable _inactivity_cover
    ) external {
        require(
            AUTH_MANAGER == address(0) && _auth_manager != address(0),
            "ALREADY_INITIALIZED"
        );
        staking = ParachainStaking(0x0000000000000000000000000000000000000800);
        AUTH_MANAGER = _auth_manager;
        INACTIVITY_COVER = _inactivity_cover;
    }

    /// ***************** STAKING MANAGER FUNCTIONS *****************

    /**
    @notice Used by staking manager to stake the cover contract's funds to generate income for manager
    @dev Delegate the contracts funds to a collator. Can be called only by staking manager.
    The cover contract does not have any fees and it relies on staking to generate income for the contract manager/owner.
    However, some funds must remain liquid to be able to meet cover claims and member withdrawals.
    It is the job of the staking manager to ensure enough liquid funds are available.
    If a payment to a delegator or collator member fails, then anybody can force the automatic undelegation of funds.
    @param candidate The collator to delegate it to
    @param candidateDelegationCount The number of delegations this collator has
    @param delegatorDelegationCount The number of delegations this contracts has
    */
    function delegate(
        address candidate,
        uint256 amount,
        uint256 candidateDelegationCount,
        uint256 delegatorDelegationCount
    ) external auth(ROLE_STAKING_MANAGER) {
        // To delegate, there must not exist an unpaid delegator or member
        require(
            InactivityCover(INACTIVITY_COVER).memberNotPaid() == address(0),
            "MEMBER_N_PAID"
        );
        require(
            InactivityCover(INACTIVITY_COVER).delegatorNotPaid() == address(0),
            "DELEG_N_PAID"
        );
        // this balance does not include amounts in unstaking phase (pending decreases, revokes, etc.)
        uint256 balance = address(INACTIVITY_COVER).balance + stakedTotal;
        require(
            stakedTotal + amount <= (maxPercentStaked * balance) / 100,
            "EXCEEDS_MAX_PERCENT"
        );

        if (!delegations[candidate].isDelegated) {
            collatorsDelegated.push(candidate);
            delegations[candidate].isDelegated = true;
        }
        delegations[candidate].amount += amount;
        stakedTotal += amount;
        // will fail if already delegating to this collator
        InactivityCover(INACTIVITY_COVER).delegate(
            candidate,
            amount,
            candidateDelegationCount,
            delegatorDelegationCount
        );
        emit DelegateEvent(candidate, amount);
    }

    /**
    @notice Bond more of this contract's balance to a collator that the contract already delegates to.
    @dev The staking manager can increase the cover contract's delegation to a collator by calling this method.
    The cover contract must not have any pending defaults to members or delegators. Therefore, if a default to
    a delegator happens, that delegator must be first paid before this method can be called. Similarly, if a
    default to a member withdrawal happens, the member must first be paid or cancel their withdrawal, before
    this method can be called.
    @param candidate The address of the collator candidate for which delegation shall increase
    @param more The amount by which the delegation is increased
    */
    function delegatorBondMore(
        address candidate,
        uint256 more
    ) external auth(ROLE_STAKING_MANAGER) {
        // To bond more, there must not exist an unpaid delegator or member
        require(
            InactivityCover(INACTIVITY_COVER).memberNotPaid() == address(0),
            "MEMBER_N_PAID"
        );
        require(
            InactivityCover(INACTIVITY_COVER).delegatorNotPaid() == address(0),
            "DELEG_N_PAID"
        );
        delegations[candidate].amount += more;
        stakedTotal += more;
        InactivityCover(INACTIVITY_COVER).delegator_bond_more(candidate, more);
        emit DelegatorBondMoreEvent(candidate, more);
    }

    /**
    @notice Request to bond less for delegators with respect to a specific collator candidate
    @dev Staking manager can decrease staked funds to increase liquid funds to be able to meet payment obligations
    (delegator claims and member withdrawals). There is no method to cancel a scheduled decrease request, so all
    requests must be executed (anybody can execute pending requests on chain) for the funds to be added to the reducible
    balance of the contract. During the decrease period, the funds do not show up in the contract's reducible balance or the
    stakedTotal variable. This is by design and it has the effect of under-estimating the contract's total funds (staked + liquid)
    by the amount of funds that are pending unstaking.
    @param candidate The address of the collator candidate for which delegation shall decrease
    @param less The amount by which the delegation is decreased (upon execution)
    */
    function scheduleDelegatorBondLess(
        address candidate,
        uint256 less
    ) external auth(ROLE_STAKING_MANAGER) {
        _scheduleDelegatorBondLess(candidate, less);
        emit DelegatorBondLessEvent(candidate, less);
    }

    /**
    @notice Request to revoke delegation with respect to a specific collator candidate
    @dev Everything that applies in scheduleDelegatorBondLess, applies here too. Scheduling a revoke is a one-way operation as there
    is no method to cancel it and anybody can execute it when ready.
    @param candidate The address of the collator candidate for which delegation shall decrease
    */
    function scheduleDelegatorRevoke(
        address candidate
    ) external auth(ROLE_STAKING_MANAGER) {
        _scheduleDelegatorRevoke(candidate);
        emit RevokeEvent(candidate);
    }

    /**
    @notice Manager can limit the staking manager as to what % of the contract funds they can stake
    @dev The stakign manager should ensure that the contract has enough liquid funds to meet obligations. As an additional measure,
    the maanager can impose a limit to the staking manager in regard to what % of the contract funds they can stake at any time.
    @param _maxPercentStaked a number between 0 and 100 that indicates what percentage of contracts funds (excluding funds in unstaking) can be staked at any time.
     */
    function setMaxPercentStaked(uint256 _maxPercentStaked) external auth(ROLE_MANAGER) {
        require(_maxPercentStaked <= 100, "INV_PERCENT");
        maxPercentStaked = _maxPercentStaked;
    }

    /// ***************** FUNCTIONAS CALLABLE BY ANYBODY *****************

    /**
    @notice Allows anybody to force a revoke to increase the contract's reducible balance so it can make payments.
    @dev The method can be called with limited frequency and only if the contract has defaulted in making payments to delegators or members.
    The method will choose the collator with the smallest delegation to revoke from and reset the default flags. This allows for a gradual
    undelegation of collators (from lowest delegation to highest) over a period of time, causing minimum disruption to collators while also
    guaranteeing that all members and delegators can get their funds, even if the staking manager dissapears.
    Calling the method does not guarantee that the delegator or member that was not paid, WILL be able to get paid, as the revoked amount may be less.
    However, users can keep revoking until the liquid balance is high enough to meet obligations.
    This is a method of last resort and it allows members and delegators to get their funds, should the manager fail to keep enough funds liquid.
    The manager would want to avoid forcing users to run this function which is 1) inconvenient for them, and 2) exposes the manager to random revoke risk.
    */
    function forceScheduleRevoke() external {
        // There must be a non-paid delegator or member to call this method
        require(
            InactivityCover(INACTIVITY_COVER).delegatorNotPaid() !=
                address(0) ||
                InactivityCover(INACTIVITY_COVER).memberNotPaid() != address(0),
            "FORBIDDEN"
        );
        // The contract must have staked funds
        require(stakedTotal > 0, "ZERO_STAKED");
        // Check that this method didn't execute again in the past ERAS_BETWEEN_FORCED_UNDELEGATION eras
        require(
            lastForcedUndelegationEra +
                InactivityCover(INACTIVITY_COVER)
                    .ERAS_BETWEEN_FORCED_UNDELEGATION() <=
                _getEra(),
            "TOO_FREQUENT"
        );
        lastForcedUndelegationEra = _getEra();

        // Find the collator with the lowest delegation
        uint256 lowestDelegation = type(uint256).max;
        address lowestDelegationCandidate;
        for (uint256 i; i < collatorsDelegated.length; i++) {
            address candidate = collatorsDelegated[i];
            if (candidate != address(0) && delegations[candidate].amount != 0 && delegations[candidate].amount < lowestDelegation) {
                lowestDelegation = delegations[candidate].amount;
                lowestDelegationCandidate = candidate;
                emit DelegatorBondLessEvent(address(0), delegations[candidate].amount);
            }
        }
        require(lowestDelegationCandidate != address(0), "NO_CANDIDATE");
        _scheduleDelegatorRevoke(lowestDelegationCandidate);
        emit ForceRevokeEvent(lastForcedUndelegationEra, lowestDelegationCandidate);
    }

    /// ***************** GETTERS *****************

    function getIsDelegated(
        address candidate
    ) external view auth(ROLE_STAKING_MANAGER) returns (bool) {
        return delegations[candidate].isDelegated;
    }

    function getDelegation(
        address candidate
    ) external view auth(ROLE_STAKING_MANAGER) returns (uint256) {
        return delegations[candidate].amount;
    }

    function getCollatorsDelegated(
        uint256 index
    ) external view auth(ROLE_STAKING_MANAGER) returns (address) {
        return collatorsDelegated[index];
    }

    /// ***************** INTERNAL FUNCTIONS *****************

    function _scheduleDelegatorBondLess(
        address candidate,
        uint256 less
    ) internal {
        delegations[candidate].amount -= less;
        stakedTotal -= less;
        if (delegations[candidate].amount == 0) {
            delegations[candidate].isDelegated = false;
            for (uint256 i; i < collatorsDelegated.length; i++) {
                if (collatorsDelegated[i] == candidate) {
                    delete collatorsDelegated[i];
                    break;
                }
            }
        }
        // There is no method to cancel a request, and anybody can execute a scheduled request, so this is a one-way to decreasing the delegation
        InactivityCover(INACTIVITY_COVER).schedule_delegator_bond_less(
            candidate,
            less
        );
    }

    function _scheduleDelegatorRevoke(address candidate) internal {
        stakedTotal -= delegations[candidate].amount;
        delegations[candidate].amount = 0;
        delegations[candidate].isDelegated = false;
        for (uint256 i; i < collatorsDelegated.length; i++) {
            if (collatorsDelegated[i] == candidate) {
                delete collatorsDelegated[i];
                break;
            }
        }
        // There is no method to cancel a request, and anybody can execute a scheduled request, so this is a one-way to revoking the delegation
        InactivityCover(INACTIVITY_COVER).schedule_delegator_revoke(candidate);
    }

    function _getEra() internal view virtual returns (uint128) {
        return uint128(staking.round());
    }
}
