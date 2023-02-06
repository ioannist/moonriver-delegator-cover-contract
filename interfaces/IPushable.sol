// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./Types.sol";

interface IPushable {

    function pushData(uint128 _eraId, Types.OracleData calldata _report, address _oracleCollator) external;

}
