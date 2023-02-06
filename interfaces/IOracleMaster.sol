// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

interface IOracleMaster {

    function getOracle() view external returns (address);

    function eraId() view external returns (uint128);

    function getOraclePointBitmap(address _oracleMember) external view returns(uint16);

}