
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