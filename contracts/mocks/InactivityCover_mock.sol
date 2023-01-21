// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../InactivityCover.sol";
import "./DepositStaking_mock.sol";

contract InactivityCover_mock is InactivityCover {

    bool private isProxyOfSelectedCandidateMock = true;
    bool private simulateNoProxySupportMock = false;

    function timetravel(uint64 eras) external {
        eraId += eras;
    }

    function setEra_mock(uint64 _era) external {
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

    function setPayoutsOwedTotal_mock(uint256 amount) external {
        payoutsOwedTotal = amount;
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

    function delegator_bond_more(
        address candidate,
        uint256 more
    ) external override onlyDepositStaking {
        address(0).call{value: more}("");
    }

    function schedule_delegator_bond_less(
        address candidate,
        uint256 less
    ) external override onlyDepositStaking {}

    function schedule_delegator_revoke(
        address candidate
    ) external override onlyDepositStaking {}

    function _getEra() internal view override returns (uint128) {
        return eraId;
    }

    function _getDelegationAmount(address _delegator, address _collator, uint256 _reportedAmount) internal view override returns (uint256) {
        return _reportedAmount;
    }

    function _getCandidateTotalCounted(address _collator, uint256 _reportedAmount) internal view override returns (uint256) {
        return _reportedAmount;
    }

    function _isLastCompletedEra(
        uint128 _eraId
    ) internal view override returns (bool) {
        return true;
    }

    function _isProxyOfSelectedCandidate(
        address _oracle,
        address _collator
    ) internal view override returns (bool) {
        if (simulateNoProxySupportMock) {
            revert("CANNOT_CALL_PROXY_PRECOMP_FROM_SC");
        }
        return isProxyOfSelectedCandidateMock;
    }

    function setIsProxySelectedCandidate_mock(bool _is) external {
        isProxyOfSelectedCandidateMock = _is;
    }

    function setSimulateNoProxySupport_mock(bool _sim) external {
        simulateNoProxySupportMock = _sim;
    }

    function _getFreeBalance() internal view override returns (uint256) {
        // The method returns the current free balance (reducible + locked), but it excludes funds
        // in unlocking (soon to be reducible)
        return
            address(this).balance +
            DepositStaking_mock(DEPOSIT_STAKING).stakedTotal(); // reducible + (staked + being_unstaked)
    }
}
