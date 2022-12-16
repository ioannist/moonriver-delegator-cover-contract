// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../InactivityCover.sol";

contract InactivityCover_mock is InactivityCover {
    function timetravel(uint64 eras) external {
        eraId += eras;
    }

    function setEra(uint64 _era) external {
        eraId = _era;
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

    /// The dev env provides only one active collator (member1 0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac) which is ok for most test cases.
    /// However, for test cases that require >1 active collators, we must uncomment the methods below:
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

    function schedule_delegator_revoke(address candidate)
        external
        override
        onlyDepositStaking
    {}

    function _getEra() internal override view returns(uint128) {
        return eraId;
    }

    function _isLastCompletedEra(uint128 _eraId) internal override view returns(bool) {
        return true;
    }

    function _isProxyOfSelectedCandidate(address _oracle, address _collator) internal override view returns(bool) {
        return true;
    }
}
