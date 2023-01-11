const path = require('path');
const fs = require('fs');

const jsonDir = './build/contracts/';

fs.readdirSync(jsonDir).forEach(file => {
    const contract = JSON.parse(fs.readFileSync(`${jsonDir}${file}`, 'utf8'));
    const name = path.parse(file).name;
    const dest = `./build/abis/${name}.abi`;
    fs.writeFileSync(dest, JSON.stringify(contract.abi));
});
console.log('Done! You will find your abis in ./build/abis/')



