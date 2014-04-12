
/*
 * GET home page.
 */
exports.delay = function(req, res){
	var addlatency = req.param('addlatency') || 1000;
	//res.write('Hello\n');
	setInterval(function() {
		res.end(' Delayed ' + addlatency + ' ms');
	},addlatency);
};
exports.delayedAsstes = function(req, res){
	var fs = require('fs'),
		asset,
		addlatency = req.param('delay') || 1000,
		assetName = req.param('asset');// || 'header.png';

	asset = fs.readFileSync('./public/img/'+assetName);
	res.writeHead(200, {'Content-Type': 'image/png' });
	setInterval(function() {
		res.end(asset, 'binary');
		//res.end('Delayed: ' + addlatency + ' ms\nAsset: ' + assetName);
	},addlatency);
};

exports.hello = function(req, res){
		res.end('Hello world');
};