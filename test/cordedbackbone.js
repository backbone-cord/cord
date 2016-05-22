if(!global.window) {
	var jsdom = require('jsdom');
	var window = jsdom.jsdom().defaultView;
	global.window = window;
	global.document = window.document;
	global.Node = window.Node;
	var Backbone = require('backbone');
	// jquery needs to be initialized outside of backbone for some strange reason
	// http://stackoverflow.com/questions/20380958/browserify-with-jquery-2-produces-jquery-requires-a-window-with-a-document
	window.$ = Backbone.$ = require('jquery');
	var Cord = require('../backbone.cord');
	// require all of the plugins to activate them
	require('../plugins/binding');
	require('../plugins/collection');
	require('../plugins/computed');
	require('../plugins/conditionalclasses');
	require('../plugins/dataid');
	require('../plugins/dynamicclasses');
	require('../plugins/events');
	require('../plugins/hidden');
	require('../plugins/interpolation');
	require('../plugins/math');
	require('../plugins/modeltracking');
	require('../plugins/replacement');
	require('../plugins/styles');
	require('../plugins/syncing');
	require('../plugins/scopes/shared');
	require('../plugins/scopes/view');
}
module.exports = require('backbone');