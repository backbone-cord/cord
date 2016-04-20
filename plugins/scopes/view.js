;(function(Backbone) {
'use strict';

var SCOPE_NAME = 'viewscope';

function _propertyObserver(key, prevSet) {
	var newSet = function(value) {
		if(prevSet)
			prevSet.call(this, value);
		else
			this._setWrappedProperty(key, value);
		this._invokeObservers(key, this[key], SCOPE_NAME);
	};
	newSet._cordWrapped = true;
	newSet._prevSet = prevSet;
	return newSet;
}

// Observe to add observer methods for existing view properties first and model attributes second
// Partly based on the watch/unwatch polyfill here: https://gist.github.com/eligrey/384583
// If wrapping properties, be sure to set configurable: true and (recommended) enumerable: true
Backbone.Cord.plugins.push({
	name: SCOPE_NAME,
	config: {
		viewPrefix: '_'
	},
	scope: {
		getKey: function(key) {
			if(key.indexOf(Backbone.Cord.config.viewPrefix) === 0)
				return key.substr(Backbone.Cord.config.viewPrefix.length);
		},
		observe: function(key) {
			var prop = Object.getOwnPropertyDescriptor(this, key);
			if(!prop)
				return;
			if(!prop.set._cordWrapped) {
				if(prop.set) {
					// Just wrap the setter of a defined property
					Object.defineProperty(this, key, {set: _propertyObserver.call(this, key, prop.set)});
				}
				else {
					// Define a new property without an existing defined setter
					this._setWrappedProperty(key, this[key]);
					if(delete this[key]) {
						Object.defineProperty(this, key, {
							get: this._getWrappedProperty.bind(this, key),
							set: _propertyObserver.call(this, key),
							enumerable: true,
							configurable: true
						});
					}
				}
			}
		},
		unobserve: function(key) {
			if(!this._getObservers(key, SCOPE_NAME).length) {
				var prop = Object.getOwnPropertyDescriptor(this, key);
				if(prop.set._prevSet) {
					// Unwrap the previous set method
					Object.defineProperty(this, key, {set: prop.set._prevSet});
				}
				else {
					// Convert the property back to a normal attribute
					var value = this[key];
					delete this[key];
					this[key] = value;
				}
			}
		},
		getValue: function(key) {
			return this[key];
		},
		setValue: function(key, value) {
			this[key] = value;
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);