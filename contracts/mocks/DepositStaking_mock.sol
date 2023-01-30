// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../DepositStaking.sol";

contract DepositStaking_mock is DepositStaking {

    // Use stakedTotal variable to simulate getDelegatorTotalStaked of the staking precompile
    uint256 public stakedTotal;

    /// Collator address, and delegation amount by this contract
    mapping(address => Delegation) public delegations;
    
    function _getEra() internal view override returns (uint128) {
        return InactivityCover(INACTIVITY_COVER).eraId();
    }

    function _getStakedTotal() internal view override returns(uint256) {
        return stakedTotal;
    }

    function _getDelegationAmount(address _delegator, address _candidate) internal view override returns(uint256) {
        return delegations[_candidate].amount;
    }

    function delegate(
        address candidate,
        uint256 amount,
        uint256 candidateDelegationCount,
        uint256 delegatorDelegationCount
    ) public override auth(ROLE_STAKING_MANAGER) {
        super.delegate(candidate, amount, candidateDelegationCount, delegatorDelegationCount);
        stakedTotal += amount;
        if (!delegations[candidate].isDelegated) {
            delegations[candidate].isDelegated = true;
        }
        delegations[candidate].amount += amount;
    }

    function delegatorBondMore(
        address candidate,
        uint256 more
    ) public override auth(ROLE_STAKING_MANAGER) {
        super.delegatorBondMore(candidate, more);
        stakedTotal += more;
        delegations[candidate].amount += more;
    }

    function _scheduleDelegatorBondLess(
        address candidate,
        uint256 less
    ) internal override {
        super._scheduleDelegatorBondLess(candidate, less);
        delegations[candidate].amount -= less;
        stakedTotal -= less;
    }

    function _scheduleDelegatorRevoke(address candidate) internal override {
        uint256 amount = delegations[candidate].amount;
        super._scheduleDelegatorRevoke(candidate);
        stakedTotal -= amount;
        delegations[candidate].amount = 0;
        delegations[candidate].isDelegated = false;
    }
}
