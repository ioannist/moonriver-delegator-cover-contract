// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../OracleMaster.sol";

contract OracleMaster_mock is OracleMaster {

    function _isProxyOfSelectedCandidate(address _oracle, address _collator) internal override view returns(bool) {
        return true;
    }

    function _getEra() public override view returns(uint128) {
        return eraId;
    }

    function _isLastCompletedEra(uint128 _eraId) internal override view returns(bool) {
        return true;
    }

}
