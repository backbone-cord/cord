;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var View = Cord.View;

var isPlainObj = Cord.isPlainObj;
var extendObj = Cord.extendObj;
var copyObj = Cord.copyObj;
var mixObj = Cord.mixObj;
var getPrototypeValuesForKey = Cord.getPrototypeValuesForKey;
var createSetValueCallback = Cord.createSetValueCallback;

extendObj(Cord, {
	config: {
		idProperties: true,
		prefixCreateElement: false
	},
	// Plugins install themselves by pushing to this array
	plugins: [],
	_sid: 1,
	_pluginsChecked: false,
	// NOTE: classes, attrs, children, and bindings are all copies and may be modified by plugins without side-effects
	// modifications will be recognized by the default behavior and returning the copy is not necessary
	_callbacks: {
		// (el) tag can process the tag value and return an element overriding the default createElement
		tag: [],
		// (el and subview) classes is an array of classname, returning [] will prevent default classes being applied
		classes: [],
		// (el conditionally invoked) attrs is a dict, returning {} will prevent default attrs being applied
		attrs: [],
		// (el conditionally invoked) children is an array of strings or dom elements
		children: [],
		// (subview) bindings that by default get converted to event listeners
		bindings: [],
		// (el and subview) when creation and setup is complete, right before el and subview return, returning a different element can replace an el
		complete: [],
		// View Class extending only, where this is the parent class and context has protoProps and staticProps arguments
		extend: [],
		// (new View) create, initialize, and remove apply to all views
		create: [],
		initialize: [],
		remove: []
	}
});

Cord.plugins._check = function() {
	var i, j, plugin, loaded = {};
	for(i = 0; i < this.length; ++i)
		loaded[this[i].name] = true;
	for(i = 0; i < this.length; ++i) {
		plugin = this[i];
		if(plugin.requirements) {
			for(j = 0; j < plugin.requirements.length; ++j)
				if(!loaded[plugin.requirements[j]])
					throw new Error('Cord plugin "' + plugin.name + '" requires missing plugin "' + plugin.requirements[j] + '"');
		}
	}
};
Cord.plugins._register = function(plugin, fnc) {
	// Copy all of the default config settings
	if(plugin.config) {
		for(var setting in plugin.config) {
			if(!Cord.config.hasOwnProperty(setting))
				Cord.config[setting] = plugin.config[setting];
		}
	}
	// Push references to all of the callback methods
	for(var callback in Cord._callbacks) {
		if(typeof plugin[callback] === 'function')
			fnc.call(Cord._callbacks[callback], plugin[callback]);
	}
	return fnc.call(this, plugin);
};
Cord.plugins.unshift = function(plugin) {
	return this._register(plugin, Array.prototype.unshift);
};
Cord.plugins.push = function(plugin) {
	return this._register(plugin, Array.prototype.push);
};

function _callPlugins(name, context) {
	// For each callbacks, call and return false if false is returned
	// Context object to communicate data between plugins and callbacks
	var callbacks = Cord._callbacks[name];
	var args = Array.prototype.slice.call(arguments, 1);
	delete context[name];
	for(var i = 0; i < callbacks.length; ++i) {
		context[name] = callbacks[i].apply(this, args) || context[name];
	}
	return context[name];
}

// Generate an arbitrary DOM node given a tag[id][classes] string, [attributes] dictionary, and [child nodes...]
// If #id is given it must appear before the .classes, e.g. #id.class1.class2 or span#id.class1.class2
function _createElement(tagIdClasses, attrs) {
	if(Cord._viewContext && this !== Cord._viewContext)
		return _createElement.apply(Cord._viewContext, arguments);
	if(typeof tagIdClasses !== 'string') {
		var component = tagIdClasses;
		// A function with an extend method will be a Backbone view
		if(typeof component === 'function' && !(component.prototype instanceof Backbone.View)) {
			var args = Array.prototype.slice.call(arguments, 1);
			// When attrs (args[0]) is null, is a child, else just copy
			if(!args[0])
				args[0] = {};
			else if(!isPlainObj(args[0]))
				args.unshift({});
			else
				args[0] = copyObj(args[0]);
			args[0].children = (args.length > 2) ? args.slice(1) : args[1];
			if(Cord.config.prefixCreateElement)
				args.unshift(this._createElement);
			return component.apply(this, args);
		}
		else {
			return _createSubview.apply(this, arguments).el;
		}
	}
	tagIdClasses = tagIdClasses.split('.');
	var context = { isView: this instanceof View };
	var tagId = tagIdClasses[0].split('#');
	var tag = tagId[0] || 'div';
	var el = context.el = this._callPlugins('tag', context, tag) || document.createElement(tag);
	var id = context.id = tagId[1] || (attrs && attrs.id);
	if(id)
		Cord.setId(el, id, this.vuid);
	var classes = tagIdClasses.slice(1);
	if(!classes.length && (attrs && attrs.className))
		classes = attrs.className.split(' ');
	Cord.addClass(el, this._callPlugins('classes', context, classes) || classes);
	if(arguments.length > 1) {
		// If attrs is not the start of children, then apply the dictionary as attributes
		var i = 1;
		if(!(typeof attrs === 'string' || attrs instanceof Backbone.View || attrs instanceof Node)) {
			i = 2;
			// Copy attrs to prevent side-effects
			attrs = copyObj(attrs);
			delete attrs.id; delete attrs.className;
			if(attrs.htmlFor) {
				attrs['for'] = attrs.htmlFor;
				delete attrs.htmlFor;
			}
			attrs = this._callPlugins('attrs', context, attrs) || attrs;
			for(var attr in attrs)
				el.setAttribute(attr, attrs[attr]);
		}
		// Copy arguments to prevent side-effects
		var child, children = Array.prototype.slice.call(arguments, i);
		if(Array.isArray(children[0]))
			children = children[0];
		children = this._callPlugins('children', context, children) || children;
		for(i = 0; i < children.length; ++i) {
			child = children[i];
			if(typeof child === 'string')
				el.appendChild(document.createTextNode(child));
			else if(child instanceof Backbone.View)
				el.appendChild(child.el);
			else
				el.appendChild(child);
		}
	}
	if(Cord.config.idProperties && context.isView && id && Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getChildById(id); },
			enumerable: true,
			configurable: false
		});
	}
	return this._callPlugins('complete', context) || el;
}

// id and classes on the subview are maintained, but recommended that id is set by the parent view
function _createSubview(instanceClass, bindings, keyValues) {
	var id, classes, subview, context, callback;
	if(!(instanceClass instanceof Backbone.View))
		subview = new instanceClass();
	else
		subview = instanceClass;
	// Set the subview's model
	if(this.model !== Cord.EmptyModel && subview.model === Cord.EmptyModel && !subview.collection && subview instanceof View) {
		if(!subview.cascade || subview.cascade(this.model) !== false)
			subview.setModel(this.model);
	}
	// Create the plugin context - isView should always be true, this method should never be called any other way
	context = { el: subview.el, isView: this instanceof View, subview: subview };
	if(!context.isView)
		throw new Error('Attempting to create a subview without a parent.');
	if(bindings) {
		id = context.id = bindings.id;
		if(id && !Cord.hasId(subview.el))
			Cord.setId(subview.el, id, this.vuid);
		if(bindings.className) {
			classes = bindings.className.split(' ');
			Cord.addClass(subview.el, this._callPlugins('classes', context, classes) || classes);
		}
		// Copy bindings to prevent side-effects
		bindings = copyObj(bindings);
		delete bindings.id; delete bindings.className;
		bindings = this._callPlugins('bindings', context, bindings) || bindings;
		for(var e in bindings) {
			callback = (typeof bindings[e] === 'string') ? (this[bindings[e]] || createSetValueCallback(bindings[e])) : bindings[e];
			if(typeof callback === 'function') {
				if(subview.properties && subview.properties.hasOwnProperty(e))
					subview.observe(e, callback.bind(this));
				else
					this.listenTo(subview, e, callback);
			}
		}
	}
	if(keyValues)
		subview.setValuesForKeys(keyValues);
	subview.sid = Cord._sid;
	Cord._sid += 1;
	subview.el.setAttribute('data-sid', subview.sid);
	this.subviews[subview.sid] = subview;
	this.listenToOnce(subview, 'remove', function(subview) {
		this.stopListening(subview);
		delete this.subviews[subview.sid];
	});
	// Simply returns getSubviewById so that the property doesn't have another strong reference to the view that would also need to be cleaned up
	if(Cord.config.idProperties && context.isView && id && Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getSubviewById(id); },
			set: function(value) {
				var el, current;
				if(!(value instanceof Backbone.View))
					throw new Error('Attempting to assign a non-Backbone.View to a subview.');
				// Add the new subview and remove the old from the DOM
				el = value.el;
				current = this.getSubviewById(id);
				current.el.parentNode.replaceChild(el, current.el);
				current.remove();
				// If the new subview doesn't have an sid it needs to get setup, but without bindings or keyValues
				if(!value.sid)
					this.createSubview(value);
				// Reapply the id or remove the old property if a different id is used
				if(!Cord.hasId(el))
					Cord.setId(el, id, this.vuid);
				else if(id !== Cord.getId(el))
					delete this[id];
			},
			enumerable: true,
			configurable: true
		});
	}
	this._callPlugins('complete', context);
	return subview;
}

function _createText(str) {
	return document.createTextNode(str);
}

function _render(element, container) {
	if(typeof element === 'function')
		element = (element.prototype instanceof Backbone.View) ? (new element()).el : element();
	else if(element instanceof Backbone.View)
		element = element.el;
	else if(typeof element === 'string')
		element = this.createText(element);
	else if(!(element instanceof Node))
		element = this.createElement(element);
	if(typeof container === 'string')
		container = document.querySelector(container);
	container.appendChild(element);
}

function _replace(child, element, container) {
	if(child === element)
		return;
	if(typeof container === 'string')
		container = document.querySelector(container);
	if(child) {
		if(child instanceof Backbone.View)
			child.remove();
		else
			container.removeChild(child);
	}
	this.render(element, container);
}

// Add layout creation methods that should be bound to allow importing of each individually
extendObj(Cord, {
	createElement: _createElement.bind(Cord),
	createText: _createText.bind(Cord),
	render: _render.bind(Cord),
	replace: _replace.bind(Cord),
	_callPlugins: _callPlugins
});
Cord.h = Cord.createElement;

extendObj(Cord.regex, {
	idPropertyTest: /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
	idSelectorValues: /#([a-zA-Z_$][0-9a-zA-Z_$]*)/g
});

Cord.hasId = function(el) {
	return !!el.getAttribute('data-id');
};
Cord.getId = function(el) {
	return el.getAttribute('data-id').split('-')[0];
};
Cord.setId = function(el, id, vuid) {
	el.setAttribute('data-id', id + (vuid ? ('-' + vuid) : ''));
};

Cord.regex.replaceIdSelectors = function(query, vuid) {
	return query.replace(this.idSelectorValues, '[data-id="$1' + (vuid ? ('-' + vuid) : '') + '"]');
};
Cord.regex.testIdProperty = function(id, noThrow) {
	var result = this.idPropertyTest.test(id);
	if(!result && !noThrow)
		throw new Error('Invalid id "' + id + '" used');
	return result;
};

// Expose createElement and createSubview on the View object as well
// _callPlugins is added because this._callPlugins is used for callbacks
View.prototype.createElement = _createElement;
View.prototype.createSubview = _createSubview;
View.prototype.createText = _createText;
View.prototype._callPlugins = _callPlugins;

// Built-in view property scope for observing view properties
// Observe to add observer methods for existing view properties first and model attributes second
// Partly based on the watch/unwatch polyfill here: https://gist.github.com/eligrey/384583
// If wrapping properties, be sure to set configurable: true and (recommended) enumerable: true
function _propertyObserver(key, prevSet) {
	var newSet = function(value) {
		if(this['_' + key] === value)
			return;
		if(prevSet)
			prevSet.call(this, value);
		else
			this['_' + key] = value;
		this._invokeObservers('this', key, this[key]);
	};
	newSet._cordWrapped = true;
	newSet._prevSet = prevSet;
	return newSet;
}
Cord.scopes.this = {
	observe: function(key) {
		var prop = Object.getOwnPropertyDescriptor(this, key);
		if(!prop)
			return;
		if(!prop.set._cordWrapped) {
			if(prop.set) {
				// Just wrap the setter of a defined property
				Object.defineProperty(this, key, {set: _propertyObserver(key, prop.set)});
			}
			else {
				// Define a new property without an existing defined setter
				this['_' + key] = this[key];
				if(delete this[key]) {
					Object.defineProperty(this, key, {
						get: this._synthesizeGetter(key),
						set: _propertyObserver(key),
						enumerable: true,
						configurable: true
					});
				}
			}
		}
	},
	unobserve: function(key) {
		if(!this._hasObservers('this', key)) {
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
};
View.prototype._synthesizeGetter = function(key) {
	key = '_' + key;
	return function() { return this[key]; };
};
View.prototype._synthesizeSetter = function(key) {
	key = '_' + key;
	return function(value) { this[key] = value; };
};
View.prototype._synthesizeReadonlySetter = function(key) {
	key = '_' + key;
	return function(value) {
		if(typeof value === 'object' && Object.getPrototypeOf(value) === Cord.ForceValue.prototype)
			this[key] = value.value;
		else
			throw new Error('Attempting to assign a readonly property.');
	};
};
// Synthesize and define a property using a simple definition, which is one or more of (get, set, value, readonly)
// When definition is a function it implies {get: definition}
// When definition is just a value it implies {value: definition} - plain objects need to be explicity set under the value key
// When get or set is missing default accessors that read/write the backing _key are used
// When set is null or readonly is true - a readonly property is created that throws an exception when trying to assign
// Readonly properties are publicly readonly but privately writeable by assigning values with the ForceValue object
View.prototype._synthesizeProperty = function(key, definition) {
	var value = null;
	var readonly = false;
	var descriptor = { configurable: true, enumerable: true };
	if(typeof definition === 'function') {
		descriptor.get = definition;
	}
	else if(isPlainObj(definition)) {
		value = definition.value;
		readonly = definition.readonly;
		descriptor.get = definition.get;
		descriptor.set = definition.set;
	}
	else {
		value = definition;
	}
	descriptor.get = descriptor.get || this._synthesizeGetter(key);
	descriptor.set = (descriptor.set === null || readonly) ? this._synthesizeReadonlySetter(key) : descriptor.set || this._synthesizeSetter(key);
	Object.defineProperty(this, key, descriptor);
	Object.defineProperty(this, '_' + key, {configurable: false, enumerable: false, value: value, writable: true});
};

View.prototype.getChildById = function(id) {
	return this.el.querySelector('[data-id="' + id + '-' + this.vuid + '"]');
};
View.prototype.getSubviewById = function(id) {
	var node = this.getChildById(id);
	if(node)
		return this.subviews[node.getAttribute('data-sid')];
};

function _terminate(f, key) { return function() { var ret = f.apply(this, arguments); var parent = Object.getPrototypeOf(Object.getPrototypeOf(this)); return (parent && parent[key]) ? parent[key].apply(this, arguments) : ret || this; }; }

// Same as _mixObj, but will terminate (call parent) any function chains if the last (terminal) obj did not implement the function
function _mixProtoProps() {
	var key, value, obj = mixObj.apply(this, arguments);
	var terminal = arguments[arguments.length - 1];
	if(typeof terminal === 'string')
		terminal = Cord.mixins[terminal] || {};
	for(key in obj) {
		value = obj[key];
		if(typeof value === 'function' && typeof terminal[key] !== 'function')
			obj[key] = _terminate(value, key);
	}
	return obj;
}

var __extend = View.extend;
View.extend = function(protoProps, staticProps) {
	protoProps = protoProps || {};
	staticProps = staticProps || {};
	if(protoProps.mixins) {
		var mixArgs = protoProps.mixins;
		delete protoProps.mixins;
		mixArgs.push(protoProps);
		protoProps = _mixProtoProps.apply(Cord, mixArgs);
	}
	// Create a unique view id for this view class. Can set a static vuid for debugging
	protoProps.vuid = protoProps.vuid || Cord.randomUID() + Cord.randomUID();
	// Call all of the plugins
	_callPlugins.call(this, 'extend', {protoProps: protoProps, staticProps: staticProps});
	// Replace all of the id selectors in the event delegation
	var key, value, events = protoProps.events;
	if(events) {
		for(key in events) {
			if(key.indexOf('#') !== -1) {
				value = events[key];
				delete events[key];
				key = Cord.regex.replaceIdSelectors(key, protoProps.vuid);
				events[key] = value;
			}
		}
	}
	// Inherit parent events, properties, and observers - only need to worry about direct inheritance as inheritance builds on itself
	if(this.prototype.events && protoProps.events)
		protoProps.events = mixObj(this.prototype.events, protoProps.events);
	if(this.prototype.properties && protoProps.properties)
		protoProps.properties = mixObj(this.prototype.properties, protoProps.properties);
	if(this.prototype.observers && protoProps.observers)
		protoProps.observers = mixObj(this.prototype.observers, protoProps.observers);
	return __extend.call(this, protoProps, staticProps);
};

var __setModel = View.prototype.setModel;
View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview;
	current = this.model;
	__setModel.apply(this, arguments);
	if(!noCascade) {
		for(key in this.subviews) {
			subview = this.subviews[key];
			// Do not cascade if the subview is not a Cord View or is intercepted by a cascade method
			if(!(subview instanceof View))
				continue;
			if(subview.cascade && subview.cascade(newModel) === false)
				continue;
			if(subview.model === current && !subview.collection)
				subview.setModel(newModel);
		}
	}
	return this;
};

// Wrap _ensureElement to add a subviews array
var __ensureElement = View.prototype._ensureElement;
View.prototype._ensureElement = function() {
	if(!Cord._pluginsChecked) {
		Cord.plugins._check();
		Cord._pluginsChecked = true;
	}
	// If model or collection is provided as a class in the prototype, then create a new instance
	// This ensures availability on creating the layout but the fetch will need to be started by the View
	var proto = Object.getPrototypeOf(this);
	if(typeof proto.collection === 'function')
		this.collection = new proto.collection();
	else if(typeof proto.model === 'function')
		this.model = new proto.model();
	this.subviews = {};
	this._observers = {};
	// Run plugin create hooks
	this._callPlugins('create', {});
	// Synthesize any declared properties
	var key;
	if(this.properties) {
		var properties = this.properties;
		for(key in properties)
			this._synthesizeProperty(key, properties[key]);
	}
	// Bind the el method with prefixed args
	// _createElement is added to override Backbone's _createElement when el is not a function
	this._createElement = this.createElement.bind(this);
	if(typeof this.el === 'function' && Cord.config.prefixCreateElement)
		this.el = this.el.bind(this, this._createElement);
	// Start listening to the model
	if(this.model !== Cord.EmptyModel)
		this.listenTo(this.model, 'change', this._modelObserver);
	// Use backbone to actually create the element
	var ret, prevContext = Cord._viewContext;
	Cord._viewContext = this;
	try {
		ret = __ensureElement.apply(this, arguments);
	}
	finally {
		Cord._viewContext = prevContext;
	}
	// Travel the prototype chain and apply all the classNames found, join into a single space separated string because some values might be space separated
	Cord.addClass(this.el, getPrototypeValuesForKey(this, 'className').join(' '));
	this.el.setAttribute('data-vuid', this.vuid);
	// Run plugin initializers
	this._callPlugins('initialize', {});
	// Setup any declared observers
	if(this.observers) {
		var observers = this.observers;
		for(key in observers)
			this.observe(key, observers[key], false);
	}
	return ret;
};

// Wrap the remove method to also process subviews and plugins
var __remove = View.prototype.remove;
View.prototype.remove = function() {
	var key;
	this._callPlugins('remove', {});
	for(key in this.subviews)
		this.subviews[key].remove();
	this.subviews = null;
	// Stop all current observers
	this.stopObserving();
	this.trigger('remove', this);
	// Backbone's remove will call stopListening(), which will provide extra cleanup and be sufficient also for some scopes
	return __remove.apply(this, arguments);
};

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
