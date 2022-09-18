// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "../InactivityCover.sol";

contract InactivityCover_mock is InactivityCover {
    function timetravel(uint64 eras) external {
        eraId += eras;
    }

    function transfer_mock(address target, uint256 amount) external {
        target.call{value: amount}("");
    }

    function removeDeposit_mock(address member, uint256 amount) external {
        members[member].deposit -= amount;
    }

    function setDelegatorNotPaid_mock(address delegator) external {
        delegatorNotPaid = delegator;
    }

    function setMemberNotPaid_mock(address member) external {
        memberNotPaid = member;
    }

    function default_mock(address member, uint256 amount) external {
        members[member].maxDefaulted = amount;
    }

    function setCoverOwedTotal_mock(uint256 amount) external {
        coverOwedTotal = amount;
    }

    function delegate(
        address candidate,
        uint256 amount,
        uint256 candidateDelegationCount,
        uint256 delegatorDelegationCount
    ) external override onlyDepositStaking {
        address(0).call{value: amount}("");
    }

    function delegator_bond_more(address candidate, uint256 more)
        external
        override
        onlyDepositStaking
    {
        address(0).call{value: more}("");
    }

    function schedule_delegator_bond_less(address candidate, uint256 less)
        external
        override
        onlyDepositStaking
    {}
}
