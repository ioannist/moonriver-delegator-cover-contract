// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "../OracleMaster.sol";

contract OracleMaster_mock is OracleMaster {

    bool private isProxyOfSelectedCandidateMock = true;
    bool private simulateNoProxySupportMock = false;

    function _isProxyOfSelectedCandidate(
        address _oracle,
        address _collator
    ) internal view override returns (bool) {
        if (simulateNoProxySupportMock) {
            revert("CANNOT_CALL_PROXY_PRECOMP_FROM_SC");
        }
        return isProxyOfSelectedCandidateMock;
    }

    function _getEra() public view override returns (uint128) {
        return eraId;
    }

    function _isLastCompletedEra(
        uint128 _eraId
    ) internal view override returns (bool) {
        return true;
    }
    
    function setIsProxySelectedCandidateMock(bool _is) external {
        isProxyOfSelectedCandidateMock = _is;
    }

    function setSimulateNoProxySupportMock(bool _sim) external {
        simulateNoProxySupportMock = _sim;
    }
}
