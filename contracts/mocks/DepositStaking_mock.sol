// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../DepositStaking.sol";

contract DepositStaking_mock is DepositStaking {

    function _getEra() internal override view returns(uint128) {
        return InactivityCover(INACTIVITY_COVER).eraId();
    }
}
