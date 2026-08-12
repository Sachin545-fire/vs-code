const path = require('path');
const config = { version: '1.0' }; // Dummy
const { getProductionDependencies } = require('./build/lib/dependencies.js');
const root = path.resolve('.');
const productionDependencies = getProductionDependencies(root);
const dependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => [d + '/**', '!' + d + '/**/{test,tests}/**']).flat().concat('!**/*.mk');
const fs = require('fs');
fs.writeFileSync('test-deps.json', JSON.stringify(dependenciesSrc, null, 2));
