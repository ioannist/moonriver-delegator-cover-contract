module.exports = {
              compilers: {
                solc: {
                  version: '0.8.3',
                  settings: {
                    optimizer: {
                      enabled: true,
                      runs: 9999,
                    },
                    evmVersion: null
                  }
                }
              }
            }