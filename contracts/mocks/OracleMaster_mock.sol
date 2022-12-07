// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../OracleMaster.sol";

contract OracleMaster_mock is OracleMaster {

    function isProxyOfSelectedCandidate(address _oracle, address _collator) public override view returns(bool) {
        return true;
    }

}
