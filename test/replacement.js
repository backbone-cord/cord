var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('replacement plugin', function() {
	before(function() {

		Backbone.Cord.addReplacement('paragraph', function(el) {
			return this._el('p.paragraph.replaced');
		});

		Backbone.Cord.addReplacement('widget', function() {
			var fragment = document.createDocumentFragment();
			fragment.appendChild(this._el('label.replaced2'));
			fragment.appendChild(this._el('input.replaced3'));
			return fragment;
		});

		Backbone.Cord.addReplacement('div.complex.selector[data-test="dog"]', function() {
			return this._el('h1');
		});
	});
	describe('paragraph', function() {
		it('paragraph should be p with className "paragraph replaced"', function() {
			var el = Backbone.Cord._el('paragraph');
			assert.equal(el.tagName, 'P');
			assert.equal(el.className, 'paragraph replaced');
		});
	});
	describe('widget', function() {
		it('el.children should contain two', function() {
			var el = Backbone.Cord._el('widget');
			assert.equal(el.childNodes.length, 2);
		});
	});
	describe('complex selector', function() {
		it('.complex.selector[data-test="dog"] should get replaced with h1', function() {
			var el = Backbone.Cord._el('.complex.selector', {'data-test': 'dog'});
			assert.equal(el.tagName, 'H1');
		});
		it('.complex.selector[data-test="puppy"] should not get replaced with h1', function() {
			var el = Backbone.Cord._el('.complex.selector', {'data-test': 'puppy'});
			assert.notEqual(el.tagName, 'H1');
		});
	});
});