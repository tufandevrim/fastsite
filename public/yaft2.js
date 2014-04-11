;(function (w, d) {
	'use strict';
	// don't allow this code to be included twice
    if (w.YAFT !== undefined) {
        return;
    }
    //private variables
	var raf,
		perf,
		isInitialized = false,
		perfExists = false,
		showReport = false,
		startTime = new Date().getTime(), // We have to have this as perf.timing.navigationStart
		isLoadFired = false,
		de = d.documentElement,
		confs = {
			useNormalizeCoverage: true,
			maxWaitTime: 3000,
			modules: [],
			modulesExclude: []
		},
		viewport,
		aft = 0,
		totalCoveragePercentage = 0,
		normTotalCoveragePercentage = 0,
		costlyResources = [],
		timings = {},
		modules = {},
		visuallyComplete = 0,
		modulesReport = {};

	/**
	 * Creates array of timing entries from Navigation and Resource Timing Interfaces
	 * @returns {object[]}
	 */
	function getTimings() {
		var entries = [],
			n,
			resources = []; // Other entries come from Resource Timing API
	
		// Page times come from Navigation Timing API
		entries.push(createEntryFromNavigationTiming());
		
		if(perf.getEntriesByType !== undefined) {
			resources = perf.getEntriesByType('resource');
		}
		else if(perf.webkitGetEntriesByType !== undefined) {
			resources = perf.webkitGetEntriesByType('resource');
		}
		// Do it by name???
		for(n = 0; n < resources.length; n++) {
			entries.push(createEntryFromResourceTiming(resources[n]));
		}

		return entries;
	}

	/**
     * Creates an entry from a PerformanceResourceTiming object 
     * @param {object} resource
     * @returns {object}
	 */
	function createEntryFromResourceTiming(resource) {
		// TODO: Add fetchStart and duration, fix TCP, SSL timings
		// NB
		// AppCache: start = fetchStart, end = domainLookupStart, connectStart or requestStart
		// TCP: start = connectStart, end = secureConnectionStart or connectEnd
		// SSL: secureConnectionStart can be undefined
		return {
			url: resource.name,
			start: resource.startTime,
			duration: resource.duration,
			durationFromNStart: (resource.duration > 0) ? (resource.duration + resource.startTime) : resource.startTime,
			redirectStart: resource.redirectStart,
			redirectDuration: resource.redirectEnd - resource.redirectStart,
			appCacheStart: 0, // TODO
			appCacheDuration: 0, // TODO
			dnsStart: resource.domainLookupStart,
			dnsDuration: resource.domainLookupEnd - resource.domainLookupStart,
			tcpStart: resource.connectStart,
			tcpDuration: resource.connectEnd - resource.connectStart, // TODO
			sslStart: 0, // TODO
			sslDuration: 0, // TODO
			requestStart: resource.requestStart,
			requestDuration: resource.responseStart - resource.requestStart,
			responseStart: resource.responseStart,
			// ??? - Chromium returns zero for responseEnd for 3rd party URLs, bug?
			responseDuration: resource.responseStart === 0 ? 0 : resource.responseEnd - resource.responseStart
		};
	}

	/**
     * Creates an entry from a PerformanceResourceTiming object 
     * @param {object} resource
     * @returns {object}
     */
	function createEntryFromNavigationTiming() {
		var timing = perf.timing;
		// TODO: Add fetchStart and duration, fix TCP, SSL etc. timings
		return {
			url: d.location.href,
			start: 0,
			duration: timing.responseEnd - timing.navigationStart,
			durationFromNStart: timing.responseEnd - timing.navigationStart,
			redirectStart: timing.redirectStart === 0 ? 0 : timing.redirectStart - timing.navigationStart,
			redirectDuration: timing.redirectEnd - timing.redirectStart,
			appCacheStart: 0, // TODO
			appCacheDuration: 0, // TODO
			dnsStart: timing.domainLookupStart - timing.navigationStart,
			dnsDuration: timing.domainLookupEnd - timing.domainLookupStart,
			tcpStart: timing.connectStart - timing.navigationStart,
			tcpDuration: timing.connectEnd - timing.connectStart, // TODO
			sslStart: 0, // TODO
			sslDuration: 0, // TODO
			requestStart: timing.requestStart - timing.navigationStart,
			requestDuration: timing.responseStart - timing.requestStart,
			responseStart: timing.responseStart - timing.navigationStart,
			responseDuration: timing.responseEnd - timing.responseStart
		};
	}


	function getViewPort() {
		return {
			elem : {},
			win : w,
			doc : d,
			docElem : de,
			viewportWidth: (de.clientWidth < w.innerWidth ? w.innerWidth : de.clientWidth),
			viewportHeight: (de.clientHeight < w.innerHeight ? w.innerHeight : de.clientHeight),
			getScrollXY: function() {
				//TODO: use raf to reduce layout
				return {
					x: w.scrollX,
					y: w.scrollY
				};
			},
			getViewportArea : function() {
				return this.viewportWidth * this.viewportHeight;
			},
			getElementBounds : function(e) {
				var celem,
					scrollxy,
					y,
					bounding;


				if (this.elem === null || this.elem === undefined || this.elem.nodeType !== 1 || this.elem.id !== e) {
					celem = d.getElementById(e);
					if (celem === null || celem === undefined || celem.nodeType !== 1) {
						return false;
					}
					this.elem = celem;
				}

				scrollxy = this.getScrollXY();

				//Why did I have to clone it!!!
				bounding = JSON.parse(JSON.stringify(this.elem.getBoundingClientRect()));

				bounding.top = bounding.top + scrollxy.y;
				bounding.bottom = bounding.bottom + scrollxy.y;
				bounding.left = bounding.left + scrollxy.x;
				bounding.right = bounding.right + scrollxy.x;
				return bounding;
			},
			isInViewport : function(e) {
				var bounds = this.getElementBounds(e);
				return (bounds.top < this.viewportHeight && bounds.left < this.viewportWidth
						&& bounds.bottom >= 0 && bounds.right >= 0); //adding bounds.bottom and bounds.right limit
			},
			getElementCoverage : function(e) {
				var bounds = this.getElementBounds(e),
					x,
					y;

				if (bounds.right < 0) {
					x = 0; // whole element is left of viewport
				} else if (bounds.right > this.viewportWidth) {
					if (bounds.left >= 0) {
						x = this.viewportWidth - bounds.left; // right part of element is out of viewport and left is on screen
					} else {
						x = this.viewportWidth; // right part of element is out of viewport and so is left, so x becomes viewportWidth
					}
				} else if (bounds.left < 0 && bounds.right > 0) {
					x = bounds.right; // part in viewport is only visible from 0 to bounds.right
				} else {
					x = bounds.width; // the whole width of the element is on the screen
				}

				if (bounds.bottom < 0) {
					y = 0; // whole image is above viewport
				} else if (bounds.bottom > this.viewportHeight) {
					if (bounds.top >= 0) {
						y = this.viewportHeight - bounds.top; // bottom part of element is out of viewport
					} else {
						y = this.viewportHeight;
					}
				} else if (bounds.top < 0 && bounds.bottom > 0){
					y = bounds.bottom; // top part is above viewport
				} else {
					y = bounds.height; // the whole height of element is on screen
				}
				return x * y;
			},
			getElementPercentage : function(e) {
				var elemArea = this.getElementCoverage(e),
					viewArea = this.getViewportArea(),
					coverage = (elemArea * 100) / viewArea;
				return Math.round(coverage) > 0 ? coverage : 0;
			}
		};
	}

	//Draw reporting section starts
	function drawData(modData) {
		var el = d.createElement('div');

		el.className = 'aft-data-containter';
		el.innerHTML = '<div class="aft-data"><ul>'+
								'<li>Module: ' + modData.name + '</li>'+
								'<li>Load time: ' + Math.round(modData.loadTime) + ' ms</li>'+
								'<li>Coverage: ' + Math.round(modData.coveragePercentage) + '%</li>'+
								'<li>In viewport: ' + modData.inViewPort + '</li>'+
							'</ul></div>';
		return el;
	}

	function drawModuleReport(mod) {
		var dataElem, 
			thisBounds;

		dataElem = drawData(mod);
		thisBounds = viewport.getElementBounds(mod.name);
		dataElem.style.top = '-' + thisBounds.height + 'px';
		d.getElementById(mod.name).appendChild(dataElem);
	}

	function drawReportStyle() {
		// ADD THE CSS STYLES REQUIRED
		var style = d.createElement('style'),
			css = '.aft-data-containter {' +
						'text-align: left;' +
						'position: relative;' +
						'height: 0px;' +
						'z-index: 9999;' +
					'} \n ' +
					'.aft-data {' +
						'color: rgb(200, 200, 200); ' +
						'color: rgba(255, 255, 255, .7); ' +
						'background: rgb(100, 100, 100); ' +
						'background: rgba(000, 000, 000, .5); ' +
						'display: inline-block;' +
						'font-size: 12px;' +
						'font-weight: bolder;' +
					'} \n ' +
					'.aft-data ul {' +
						'margin: 0;' +
						'padding: 0 15px;' +
					'} \n ';

		style.setAttribute('type', 'text/css');
		style.appendChild(d.createTextNode(css));
		d.getElementsByTagName('head')[0].appendChild(style);
	}

	function drawReport(data) {
		var el,
			key,
			mods;

		drawReportStyle();

		el = d.createElement('div');
		el.className = 'aft-data-containter';
		el.style.position = 'absolute';
		el.style.top = '0px';
		el.style.right = '0px';
		el.innerHTML = '<div class="aft-data"><ul>'+
								'<li>PLT: ' +  Math.floor(data.pageLoadTime) + '</li>'+
								'<li>AFT: ' + Math.floor(data.aft) + '</li>'+
								'<li>Visually Complete: ' + Math.floor(data.visuallyComplete) + '</li>'+
								'<li>Start Render: ' +  Math.floor(data.startRender) + '</li>'+
								'<li>Dom Interactive: ' +  Math.floor(data.domInteractive) + '</li>'+
								'<li>Total Coverage: ' + Math.round(data.totalCoveragePercentage) +'%</li>'+
								'<li>N Total Coverage: ' + Math.round(data.normTotalCoveragePercentage) +'%</li>'+
							'</ul></div>';
		d.body.appendChild(el);

		for (key in modulesReport){
			if (modulesReport.hasOwnProperty(key)) {
				drawModuleReport(modulesReport[key]);
			}
		}
	}
	//Reporting section ends

	function getAndSetModules(rules, exclusions) {
		var modName = '',
			i,
			j,
			k,
			rule,
			elems,
			elemsLen,
			matches = false,
			exLen = (exclusions && exclusions.length) ? exclusions.length : 0,
			len = (rules && rules.length) ?  rules.length : 0;

		for (i = 0; i < len; i+=1) {
			rule = rules[i];
			elems = d.querySelectorAll('div[id^="' + rule + '"],section[id^="' + rule + '"]');
			elemsLen = elems.length;
			for (j = elemsLen - 1; j >= 0; j--) {
				modName = elems[j].id;
				matches = false;

				for (k = 0; k < exLen; k += 1) {
					if (modName.search(exclusions[k]) !== -1) {
						matches = true;
						break;
					}
				}

				if (!matches) {
					//TODO: check if its parent or any of child node is there too
					modules[modName] = elems[j];
				}
			}
		}
		return modules;
	}

	function prepareCustomModuleReport(mod, customReport){
		var modId = mod.id;
		if (!modulesReport[modId]) {
			modulesReport[modId] = getModuleReport(mod, customReport);
		}
	}
	function prepareModulesReport(mods) {
		var len = 0,
			modId;

		for (modId in mods){
			if (mods.hasOwnProperty(modId)) {
				if (!modulesReport[modId]) {
					
					modulesReport[modId] = getModuleReport(mods[modId]);

				}
			}
		}
		return modulesReport;
	}

	function getModuleReport(mod, customReport) {
		//get all srcs
		var i,
			elem,
			isCustom = false,
			resourceUrl,
			resources = [],
			resource,
			modStart = YAFT.getStartRenderTime(), //How about YAFT.getDomInteractive
			modEnd = YAFT.getStartRenderTime(), //How about YAFT.getDomInteractive
			childElements = mod.querySelectorAll('div, img, a, video, span'),
			len = childElements.length;

		if (!customReport) {
			if (childElements && len > 0) {
				// Get all child elements which has media module which requires http requests
				for (i =0; i < len; i += 1) {
					resourceUrl = '';
					elem = childElements[i];

					if (elem.nodeName === 'VIDEO') {
						//TODO
					} else if (elem.src) {
						resourceUrl = elem.src;
					} else if (elem.style && elem.style.backgroundImage) {
						resourceUrl = elem.style.backgroundImage.slice(4, -1);
					}

					if (resourceUrl) {
						resource = perf.getEntriesByName(resourceUrl);
						if (resource && resource.length && resource.length > 0) {
							resources.push(createEntryFromResourceTiming(resource[0]));
						}
					}
				}
			}

			len = resources.length;
			if (len > 0) {
				for (i =0; i < len; i += 1) {
					if (resources[i].start > modStart) {
						modStart = resources[i].start;
					}
					if (resources[i].durationFromNStart > modEnd) {
						modEnd = resources[i].durationFromNStart;
					}
				}
			}
		} else {
			isCustom = true;
			if (customReport.modStart) {
				modStart = customReport.modStart;
			}
			if (customReport.modEnd) {
				modEnd = customReport.modEnd;
			}
		}

		return {
			isCustom: isCustom,
			start: modStart,
			loadTime: modEnd,
			name: mod.id,
			resources: resources,
			inViewPort: viewport.isInViewport(mod.id),
			coverageArea: viewport.getElementCoverage(mod.id),
			coveragePercentage: viewport.getElementPercentage(mod.id)
		};
	}

	function getTotalCoverage(modReports) {
		var key,
			modCov =0,
			totCov = 0;

		for (key in modReports){
			if (modReports.hasOwnProperty(key)) {
				modCov =  modReports[key].coveragePercentage;
				if (modReports[key].inViewPort && Math.round(modCov)>0){
					totCov += modCov;
				}
			}
		}

		return totCov;
	}
	function getVisuallyComplete(aftIntervals) {
		var i,
			len = aftIntervals.length;

		for (i = 0; i < len; i += 1) {
			if (confs.useNormalizeCoverage) {
				if (Math.round(aftIntervals[i]) === Math.round(normTotalCoveragePercentage)) {
					return i * 100;
				}	
			} else {
				if (Math.round(aftIntervals[i]) === Math.round(totalCoveragePercentage)) {
					return i * 100;
				}
			}
		}
		return 0;
	}
	function getAFT() {
		var aboveFoldTime = 0, //aka Speedindex
			rnow = perf.now(), //right now
			aftIntervalCount = Math.floor(rnow / 100), // 100ms per interval. Should be max 500. Dont kill the memory
			aftIntervals = new Array(aftIntervalCount), //set intervals array for aft calculation and graph for visualization
			i,
			normTotCovPerc = 0,
			key;

			//init intervals
			for (i = 0; i < aftIntervalCount; i += 1) {
				aftIntervals[i] = 0;
			}
			i = 0;
			for (key in modulesReport){
				if (modulesReport.hasOwnProperty(key) && modulesReport[key].inViewPort && Math.round(modulesReport[key].coveragePercentage) > 0) {
					if (confs.useNormalizeCoverage) {
						modulesReport[key].normCoveragePercentage =  (modulesReport[key].coveragePercentage / totalCoveragePercentage) * 100;
						normTotCovPerc += modulesReport[key].normCoveragePercentage;
					}

					if (modulesReport[key].loadTime > 0) {
						i = Math.round(modulesReport[key].loadTime / 100);
						aftIntervals[i] += confs.useNormalizeCoverage ? modulesReport[key].normCoveragePercentage: modulesReport[key].coveragePercentage; 
					}
				}
			}

			for (i = 1; i < aftIntervalCount; i += 1) {
				aftIntervals[i] = aftIntervals[i - 1] + aftIntervals[i];
				if (confs.useNormalizeCoverage) {
					aboveFoldTime += (normTotCovPerc - aftIntervals[i]);
				} else {
					aboveFoldTime += (totalCoveragePercentage - aftIntervals[i]);
				}
			}

		return {
			aft: aboveFoldTime,
			aftIntervals: aftIntervals,
			normTotalCoveragePercentage: normTotCovPerc
		};
	}
	function getCostlyResources(){
		var timingsArray = timings.slice(0);
		timingsArray.sort(function(a,b) {
			return b.duration - a.duration;
		});
		return timingsArray;
	}
	function finalResult(evnt, callback) {
		var data = {},
			aftData = {},
			pageLoadTime = YAFT.getPageLoadTime(),
			startRender = YAFT.getStartRenderTime(),
			domElementsCount = YAFT.getDomElementsCount(),
			ttfb = YAFT.getTTFB(),
			domInteractive = YAFT.getDomInteractive();

		timings = getTimings();
		if (!(timings && timings.length && timings.length > 0)) {
			callback(null, 'No timings available');
			return;
		}

		//1. Calculate AFT
		//1.2 get viewport
		if (!viewport) {
			viewport = getViewPort();
		}
		
		//1.3 get all modules and set to modules variable
		getAndSetModules(confs.modules, confs.modulesExclude);
		
		//1.4 prepare module report which sets to modulesReport variable
		prepareModulesReport(modules);

		//1.5 get total coverage
		totalCoveragePercentage = getTotalCoverage(modulesReport);

		//1.5 finanlly calculate AFT
		aftData = getAFT(modulesReport);
		normTotalCoveragePercentage = aftData.normTotalCoveragePercentage;

		//2. Get costly resources
		costlyResources = getCostlyResources();


		//3. Calculate Visually Complete
		visuallyComplete = getVisuallyComplete(aftData.aftIntervals);

		//4. Get bandwidth and connection speed
		
		data = {
			aft: aftData.aft,
			pageLoadTime: pageLoadTime,
			startRender: startRender,
			domInteractive: domInteractive,
			ttfb: ttfb,
			event: evnt,
			modulesReport: modulesReport,
			totalCoveragePercentage: totalCoveragePercentage,
			normTotalCoveragePercentage: normTotalCoveragePercentage,
			domElementsCount: domElementsCount,
			//resources: timings,
			costlyResources: costlyResources,
			visuallyComplete: visuallyComplete
		};

		if (showReport === true) {
			drawReport(data);
		}

		//finally call callback
		if (callback) {
			YAFT.logToConsole(data);
			YAFT.logToConsole(aftData.aftIntervals);

			callback(data);
		}
	}

	function triggerPerf(evnt, callback) {
		if (isLoadFired) {
			return;
		}
		isLoadFired = true;

		if (!perfExists) {
			callback(null, 'Nav or resource timing or both are not available');
			return false;
		}

		//add extra wait
		if (confs.maxWaitTime && confs.maxWaitTime > 0) {

			setTimeout(function(){
				finalResult(evnt, callback);
			}, confs.maxWaitTime);

		} else {
			finalResult(evnt, callback);
		}
	}

	w.YAFT = {
		//required for unit testing
		triggerPerf: triggerPerf,
		triggerCustomTiming: function(mod, startTime, endTime) {
			//check isInitialized first
			if (!perfExists) {
				return false;
			}

			var nList,
				el;
			if (YAFT.isInitialized()){
				//get viewport early
				if (!viewport) {
					viewport = getViewPort();
				}
		
				//add to modules and modulesReport
				nList = d.querySelectorAll('div[id="' + mod + '"],section[id="' + mod + '"]');
				if (nList && nList.length>0) {
					el = nList[0];

					//modules[id] = module
					modules[el.id] = el;

					//add to modules report
					prepareCustomModuleReport(el, { 
						modStart: startTime,
						modEnd: endTime,
					});
				}
			}
		},
		reset: function() {
			isInitialized = true;
			isLoadFired =false; // TODO: remove event handler
			modules = [];
		},
		perfExists: function() {
			return perfExists;
		},

		isInitialized: function() {
			return isInitialized;
		},

		getConfig: function() {
			return confs;
		},
		
		getPerformance: function() {
			return w.performance || w.webkitPerformance || w.msPerformance || w.mozPerformance || w.Performance;
		},

		
		getRequestAnimationFrame: function() {
			return w.requestAnimationFrame || w.webkitRequestAnimationFrame || w.mozRequestAnimationFrame || w.msRequestAnimationFrame || function(cb) { return w.setTimeout(cb, 1000 / 60); };
		},
		
		init: function(configs, callback) {
			var key;
			//reset everthing first
			YAFT.reset();

			perf = this.getPerformance();
			raf = this.getRequestAnimationFrame();

			if (perf && perf.timing && (perf.getEntriesByType !== undefined || perf.webkitGetEntriesByType !== undefined)) {
				startTime = perf.timing.navigationStart;
				perf.now = perf.now || perf.webkitNow || perf.msNow || perf.mozNow || function () { return Date().getTime() - startTime; };
				perfExists = true;
			} else {
				callback(null, 'Nav or resource timing or both are not available');
				return false;
			}

			//determine to show report
			if (this.getQueryStrings().showaft){ 
				showReport = true; 
			}

			//set/overides configs
			for(key in configs) {
				if (confs.hasOwnProperty(key) && configs.hasOwnProperty(key)) {
					if(confs[key] !== 'undefined') {
						confs[key] = configs[key];
					}
				}
			}

			if (w.addEventListener) {
				//fire page load perf beacons on window load event
				w.addEventListener('load', function() {
					YAFT.triggerPerf('load', callback);
				}, false);
				//for fallback if onload already fired
				w.addEventListener('unload', function() {
					YAFT.triggerPerf('unload', callback);
				}, false);

			} else if (w.attachEvent) {	
				//you may not need this since load event might be fireed yet. Check perf.onloadend
				w.attachEvent('onload', function() {
					YAFT.triggerPerf('load', callback);
				});

				w.attachEvent('onunload', function() {
					YAFT.triggerPerf('unload', callback);
				});
			}
			
		},
		getDomElementsCount: function(){
			//TODO: iframes might not be included
			return d.getElementsByTagName("*").length;
		},
		getTTFB: function() {
			return perfExists ? perf.timing.responseStart - startTime : 0;
		},
		getPageLoadTime: function(){
			return perfExists ? perf.timing.loadEventEnd - startTime : 0;
		},
		getStartRenderTime: function() {
			return perfExists ? perf.timing.domContentLoadedEventEnd - startTime : 0;
		},
		getDomInteractive: function(){
			return perfExists ? perf.timing.domInteractive - startTime : 0;
		},
		getNow: function(){
			return perfExists ? perf.now() : 0;
		},
		getQueryStrings: function () {
			var result = {},
				keyValuePair = '',
				keyValuePairs = w.location.search.slice(1).split('&'),
				i = 0, 
				len = keyValuePairs.length || 0;

			for (i = 0; i <len; i += 1) {
				keyValuePair = keyValuePairs[i].split('=');
				result[keyValuePair[0]] = keyValuePair[1] || '';
			}
			return result;
		},
		//log to console
		logToConsole: function(obj) {
			if (perfExists && showReport && console && console.log) {
				console.log(obj);
			}
		}
	};
})(window, document);