// shared loader for node tests: the engine, damage model, campaign carry-over, world and battle layer
const fs = require('fs'), path = require('path'), src = f => path.join(__dirname, '../../src', f);
const HK = require(src('engine.js')); global.HK = HK;
const DMG = new Function('HK', fs.readFileSync(src('dmg.js'), 'utf8') + '; return DMG;')(HK); global.DMG = DMG;
const CAMP = new Function('HK', 'DMG', fs.readFileSync(src('campaign.js'), 'utf8') + '; return CAMP;')(HK, DMG);
const World = require(src('world/world.js')), TankAI = require(src('battle/tankai.js')), Battle = require(src('battle/battle.js')).create({ HK, CAMP, World, TankAI });
module.exports = { HK, DMG, CAMP, World, Battle };
