// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Types.sol";

interface IDepositStaking {

    function initialize(address _auth_manager) external;
    function delegate(
        address candidate,
        uint256 amount,
        uint256 candidateDelegationCount,
        uint256 delegatorDelegationCount
    ) external;
    function delegatorBondMore(address candidate, uint256 more) external;
    function scheduleDelegatorBondLess(address candidate, uint256 less) external;
    function executeDelegationRequest(address candidate) external;
    function forceScheduleDelegatorBondLess(uint256 less) external;

}