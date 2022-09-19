// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./Types.sol";

interface IOracle {
    function initialize(address oracleMaster) external;

    function reportRelay(uint256 index, uint256 quorum, uint64 eraId, Types.OracleData calldata staking) external;

    function softenQuorum(uint8 quorum, uint64 _eraId) external;

    function clearReporting() external;

    function isReported(uint256 index) external view returns (bool);

    function setInactivityCover(address _inactivity_cover) external;

    function addRemovePushable(address payable _pushable, bool _toAdd) external;
}