// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IOracleMaster {

    function getOracle(address ledger) view external returns (address);

    function eraId() view external returns (uint128);

}