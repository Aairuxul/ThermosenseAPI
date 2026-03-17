const { generateSeed } = require("./seed");

const db = generateSeed();

module.exports = db;
