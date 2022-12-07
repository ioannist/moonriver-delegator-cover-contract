// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma abicoder v2;

import "../interfaces/IAuthManager.sol";
import "./InactivityCover.sol";

contract DepositStaking {
    struct Delegation {
        bool isDelegated;
        uint256 amount;
    }

    // auth manager contract address
    address public AUTH_MANAGER;
    // inactivity cover contract address
    address payable public INACTIVITY_COVER;

    // Variables for staking this contract's funds to generate income
    // Total staked by this contract
    uint256 public stakedTotal;
    // Addresses of collators this contract has delegated to
    address[] internal collatorsDelegated;
    // Collator address, and delegation amount by this contract
    mapping(address => Delegation) public delegations;
    // Last era that a forced undelegaton was requested
    uint128 public lastForcedUndelegationEra;

    // Stakign manager can stake/unstake contract funds
    bytes32 internal constant ROLE_STAKING_MANAGER = keccak256("ROLE_STAKING_MANAGER");

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
        address payable _inactivity_cover
    ) external {
        AUTH_MANAGER = _auth_manager;
        INACTIVITY_COVER = _inactivity_cover;
    }

    /// @dev Delegate the contracts funds to a collator
    /// @param candidate The collator to delegate it to
    /// @param candidateDelegationCount The number of delegations this collator has
    /// @param delegatorDelegationCount The number of delegations this contracts has
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
    }

    /// @dev Bond more for delegators with respect to a specific collator candidate
    /// Selector: f8331108
    /// @param candidate The address of the collator candidate for which delegation shall increase
    /// @param more The amount by which the delegation is increased
    function delegatorBondMore(address candidate, uint256 more)
        external
        auth(ROLE_STAKING_MANAGER)
    {
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
    }

    /// @dev Request to bond less for delegators with respect to a specific collator candidate
    /// Selector: 00043acf
    /// @param candidate The address of the collator candidate for which delegation shall decrease
    /// @param less The amount by which the delegation is decreased (upon execution)
    function scheduleDelegatorBondLess(address candidate, uint256 less)
        external
        auth(ROLE_STAKING_MANAGER)
    {
        _scheduleDelegatorBondLess(candidate, less);
    }

    /// @dev Allows anybody to force an undelegation to increase the contract's reducible balance so it can make payments. Can be called with limited frequency and only if the contract has failed to make payments.
    /// @param less How much to undelegate
    function forceScheduleDelegatorBondLess(uint256 less) external {
        require(less > 0, "AMOUNT_N_POSITIVE");
        // There must be a non-paid delegator or member to call this method
        require(
            (InactivityCover(INACTIVITY_COVER).delegatorNotPaid() !=
                address(0) &&
                less <= InactivityCover(INACTIVITY_COVER).coverOwedTotal()) ||
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
                InactivityCover(INACTIVITY_COVER).getEra(),
            "TOO_FREQUENT"
        );
        lastForcedUndelegationEra = InactivityCover(INACTIVITY_COVER).getEra();

        // A random collator with a delegated balance is chosen to undelegate from
        uint256 collatorIndex = _random() % collatorsDelegated.length;
        for (
            uint256 counter = collatorsDelegated.length;
            counter > 0;
            counter--
        ) {
            address candidate = collatorsDelegated[collatorIndex];
            if (candidate == address(0)) {
                continue;
            }
            if (delegations[candidate].amount > 0) {
                uint256 amount = delegations[candidate].amount < less
                    ? delegations[candidate].amount
                    : less;
                _scheduleDelegatorBondLess(candidate, amount);
                break;
            }
            collatorIndex = (collatorIndex + 1) % collatorsDelegated.length;
        }
    }

    function getIsDelegated(address candidate)
        external
        view
        auth(ROLE_STAKING_MANAGER)
        returns (bool)
    {
        return delegations[candidate].isDelegated;
    }

    function getDelegation(address candidate)
        external
        view
        auth(ROLE_STAKING_MANAGER)
        returns (uint256)
    {
        return delegations[candidate].amount;
    }

    function getCollatorsDelegated(uint256 index)
        external
        view
        auth(ROLE_STAKING_MANAGER)
        returns (address)
    {
        return collatorsDelegated[index];
    }

    function _scheduleDelegatorBondLess(address candidate, uint256 less)
        internal
    {
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
        InactivityCover(INACTIVITY_COVER).schedule_delegator_bond_less(
            candidate,
            less
        );
        // There is no method to cancel a request, and anybody can execute a scheduled request, so this is a one-way to decreasing the delegation
    }

    function _random() private view returns (uint256) {
        uint256 number = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.difficulty))
        ) % 251;
        return number;
    }
}
