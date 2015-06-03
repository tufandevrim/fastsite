;(function (w, d) {
	'use strict';
	// don't allow this code to be included twice
	if (w.YAFT !== undefined) {
		return;
	}
	//private variables
	var version = '0.2.1',
		perf,
		isInitialized = false,
		perfExists = false,
		showReport = false,
		startTime = new Date().getTime(), // We have to have this as perf.timing.navigationStart
		isLoadFired = false,
		de = d.documentElement,
		confs = {
			useNormalizeCoverage: true,
			useCustomSelector: false,
			canShowVisualReport: true,
			useNativeStartRender: false,
			generateHAR: false,
			maxWaitTime: 3000,
			modules: [],
			modulesExclude: [],
			modulesAft2Container: [],
			plugins: []
		},
		startRender = 0,
		viewport,
		aft = 0,
		totalCoveragePercentage = 0,
		normTotalCoveragePercentage = 0,
		costlyResources = [],
		timings = {},
		modules = {},
		visuallyComplete = 0,
		modulesReport = {},
		aft2StartTime = 0, // delta between navstarttime and second AFT start time
		aft2EndTime = 0,
		aft2NavStart = 0,
		aft2StartRender = 0,
		aftTimer = 0, //first aft setTimeoutID
		aft2Timer = 0; //second aft setTimeoutID

	/**
	 * Clones an object. Simplified recursive version
	 * @param {object} obj
	 * @returns {object}
	 */
	function cloneObject(obj) {
		var clone = {},
			i;
		for(i in obj) {
			if (typeof(obj[i]) === 'object' && obj[i] !== null) {
				clone[i] = cloneObject(obj[i]);
			} else {
				clone[i] = obj[i];
			}
		}
		return clone;
	}

	function getHAR(entries) {
		var ua = navigator.userAgent,
			ver = navigator.appVersion,
			entry,
			ntiming= perf.timing,
			navStart = ntiming.navigationStart,
			dt, sdt = new Date(navStart),
			url, t, adhoc, n,
			httpStatus = '200', httpText = 'OK', fileSize = -1,
			tdns = 0,
			tconnect = 0,
			tsend = 0,
			treceive = 0,
			tssl = -1,
			twait = 0,
			ttime = 0,
			nextStart = 0;

		// this is an empty HAR 1.2 object, for the complete structure see http://www.softwareishard.com/blog/har-12-spec/
		adhoc = {
			log: {
				version: '1.2',
				creator : {
					name : 'YAFT', version : '0.1.0'
				},
				browser : {
					name: ua, version: ver
				},
				pages : [{
					startedDateTime: sdt.toISOString(),
					id: 'Page_1',
					title: d.location.href,
					pageTimings: {
						onContentLoad: ntiming.domInteractive - navStart,
						onLoad: ntiming.loadEventStart - navStart
					}
				}],
				entries : [],
				comment : ''
			}
		};

		for(n = 0; n < entries.length; n += 1) {
			entry = entries[n];
			dt = new Date(Math.round(navStart + entry.start));
			tdns = Math.round(entry.dnsDuration);
			tconnect = Math.round(entry.tcpDuration);
			tssl =  Math.round(entry.sslDuration);
			tsend = Math.round(entry.responseStart - entry.requestStart);
			treceive = Math.round(entry.responseDuration);
			twait = Math.round(entry.duration) - tdns - tconnect - tsend - treceive;
			ttime = Math.round(entry.duration);
			if (twait < 0) {
				// if the rounding made twait below zero we need to fix the total time to match the sum because no timings can be below zero
				ttime = ttime - twait;
				twait = 0;
			}
			t = {
				pageref: 'Page_1',
				startedDateTime: dt.toISOString(),
				time: ttime,
				request: {
					method: 'GET',
					url: entry.url,
					httpVersion: 'HTTP/1.1',
					cookies: [],
					headers: [],
					queryString: [],
					headersSize: -1,
					bodySize: -1
				},
				response: {
					status: httpStatus,
					statusText: httpText,
					httpVersion: 'HTTP/1.0',
					cookies: [],
					headers: [],
					content: {
						size: fileSize,
						compression: 0,
						mimeType: ''
					},
					redirectURL: '',
					headersSize: -1,
					bodySize: fileSize
				},
				cache: {},
				timings: {
					blocked: -1,
					dns: tdns,
					connect: tconnect,
					send: tsend,
					ssl: tssl,
					wait: twait,
					receive: treceive
				}
			};
			//console.log(JSON.stringify(t) + '\n' );
			adhoc.log.entries.push(t);
		}
		return adhoc;

	}
	/**
	 * Creates array of timing entries from Navigation and Resource Timing Interfaces
	 * @returns {object[]}
	 */
	function getTimings() {
		var entries = [],
			n,
			i,
			iframes,
			parentDelta = 0,
			resources = []; // Other entries come from Resource Timing API
	
		// Page times come from Navigation Timing API
		entries.push(createEntryFromNavigationTiming());

		resources = perf.getEntriesByType('resource');

		for(n = 0; n < resources.length; n += 1) {
			if (resources[n].name !== 'document') {
				entries.push(createEntryFromResourceTiming(resources[n]));
			}
		}
		//TODO: iframes have their own resource timings. Normilize to parents navigation start
		iframes = document.getElementsByTagName('iframe');
		if (iframes && iframes.length) {
			for (i = 0; i < iframes.length; i += 1) {
				try {
					resources = iframes[i].contentWindow.performance.getEntriesByType('resource');
					parentDelta = iframes[i].contentWindow.performance.timing.navigationStart - perf.timing.navigationStart;
					for(n = 0; n < resources.length; n += 1) {
						if (resources[n].name !== 'document') {
							entries.push(createEntryFromResourceTiming(resources[n], parentDelta));
						}
					}
				} catch (e){
					//most probably security origin issue.
				}
			}
			entries.sort(function(a, b) {
				return a.start - b.start;
			});
		}

		return entries;
	}

	/**
     * Creates an entry from a PerformanceResourceTiming object 
     * @param {object} resource
     * @returns {object}
	 */
	function createEntryFromResourceTiming(resource, parentDelta) {
		// TODO: Add fetchStart and duration, fix TCP, SSL timings
		// NB
		// AppCache: start = fetchStart, end = domainLookupStart, connectStart or requestStart
		// TCP: start = connectStart, end = secureConnectionStart or connectEnd
		// SSL: secureConnectionStart can be undefined
		if (!(parentDelta && parentDelta > 0)) {
			parentDelta = 0;
		}
		return {
			url: resource.name,
			start: resource.startTime + parentDelta,
			duration: resource.duration,
			durationFromNStart: (resource.duration > 0) ? (resource.duration + resource.startTime + parentDelta) : resource.startTime + parentDelta,
			redirectStart: resource.redirectStart + parentDelta,
			redirectDuration: resource.redirectEnd - resource.redirectStart,
			appCacheStart: 0, // TODO
			appCacheDuration: 0, // TODO
			dnsStart: resource.domainLookupStart + parentDelta,
			dnsDuration: resource.domainLookupEnd - resource.domainLookupStart,
			tcpStart: resource.connectStart + parentDelta,
			tcpDuration: resource.connectEnd - resource.connectStart, // TODO
			sslStart: (resource.secureConnectionStart > 0) ? resource.secureConnectionStart - resource.connectStart : 0,
			sslDuration: (resource.secureConnectionStart > 0) ? (resource.connectEnd - resource.secureConnectionStart) : -1,
			requestStart: resource.requestStart + parentDelta,
			requestDuration: resource.responseStart - resource.requestStart,
			responseStart: resource.responseStart + parentDelta,
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
			sslStart: (timing.secureConnectionStart > 0) ? timing.secureConnectionStart - timing.connectStart : 0,
			sslDuration: (timing.secureConnectionStart > 0) ? (timing.connectEnd - timing.secureConnectionStart) : -1,
			requestStart: timing.requestStart - timing.navigationStart,
			requestDuration: timing.responseStart - timing.requestStart,
			responseStart: timing.responseStart - timing.navigationStart,
			responseDuration: timing.responseEnd - timing.responseStart
		};
	}


	/**
     * Gets viewport object and helper functions for area calculation
     * @returns {object}
     */
	function getViewPortObject() {
		return {
			win : w,
			doc : d,
			docElem : de,
			viewportWidth: (de.clientWidth < w.innerWidth ? w.innerWidth : de.clientWidth),
			viewportHeight: (de.clientHeight < w.innerHeight ? w.innerHeight : de.clientHeight),
			getScrollXY: function() {
				//TODO: use requestAnimationFrame to reduce layout trashing
				return {
					x: w.scrollX || w.pageXOffset,
					y: w.scrollY || w.pageYOffset
				};
			},
			getViewportArea : function() {
				return this.viewportWidth * this.viewportHeight;
			},
			getElementBounds : function(e, notID) {
				var scrollxy,
					elem,
					bounding;
				if (notID) {
					elem = e;
				} else {
					elem = d.getElementById(e);
				}
				scrollxy = this.getScrollXY();

				//Why did I have to clone it!!!
				bounding = cloneObject(elem.getBoundingClientRect());

				bounding.top = bounding.top + scrollxy.y;
				bounding.bottom = bounding.bottom + scrollxy.y;
				bounding.left = bounding.left + scrollxy.x;
				bounding.right = bounding.right + scrollxy.x;
				return bounding;
			},
			isInViewport : function(e, notID) {
				var bounds = this.getElementBounds(e, notID);
				//adding bounds.bottom and bounds.right limit
				return (bounds.top < this.viewportHeight && bounds.left < this.viewportWidth && bounds.bottom >= 0 && bounds.right >= 0 && this.isVisible(e, notID));
			},
			isVisible : function(e, notID) {
				var visbl = true,
					elem = e;
				if (!notID) {
					elem = d.getElementById(e);
				}
				visbl = visbl && elem.offsetWidth > 0 && elem.offsetHeight > 0;
				if(visbl) {
					while('BODY' != elem.tagName && visbl) {
						visbl = visbl && 'hidden' != w.getComputedStyle(elem).visibility;
						elem = elem.parentElement;
					}
				}
				return visbl;
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

	function getAndSetModules(rules, exclude, aft2Container) {
		var modName = '',
			i, j,
			rule,
			elems, el,
			elemsLen,
			matches = false,
			exclusions = [],
			exLen = 0,
			isAft2Elem = false,
			len = (rules && rules.length) ?  rules.length : 0;

		if (exclude && !aft2Container) {
			exclusions = exclude;
		} else if (!exclude && aft2Container) {
			exclusions = aft2Container;
		} else if (exclude && aft2Container) {
			exclusions = exclude.concat(aft2Container);
		}
		exLen = (exclusions && exclusions.length) ? exclusions.length : 0;

		for (i = 0; i < len; i+=1) {
			rule = rules[i];

			if (confs.useCustomSelector) {
				elems = d.querySelectorAll(rule);
			} else {
				elems = d.querySelectorAll('div[id^="' + rule + '"],section[id^="' + rule + '"], ul[id^="' + rule + '"], ol[id^="' + rule + '"], li[id^="' + rule + '"]');
			}

			elemsLen = elems.length;
			for (j = elemsLen - 1; j >= 0; j--) {
				modName = elems[j].id;
				matches = false;

				if (exclusions.indexOf(modName) !== -1) {
					matches = true;
				}

				if (!matches && !modules[modName]) {
					//TODO: check if its parent or any of child node is there too

					//check if element is aft2 element
					if (aft2Container) {
						isAft2Elem = false;
						el = elems[j];
						while (el.parentNode) {
							if (aft2Container.indexOf(el.parentNode.id) !== -1) {
								isAft2Elem = true;
								break;
							}
							el = el.parentNode;
						}
					}
					elems[j].dataAft2mod = isAft2Elem;
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
	function getModuleStartTime() {
		if (confs.useNativeStartRender) {
			if (startRender) {
				return startRender;
			} else {
				return YAFT.getStartRenderTime();
			}
		} else {
			return perfExists ? perf.timing.domContentLoadedEventStart - startTime : 0;
		}
	}

	function getModuleReport(mod, customReport) {
		//get all srcs
		var i,
			elem,
			isCustom = false,
			isAft2Module = false,
			resourceUrl,
			resources = [],
			resource,
			modStart = aft2StartTime ? aft2StartRender : getModuleStartTime(),
			modEnd = modStart,
			childElements = mod.querySelectorAll('div, img, a, video, span, ul, li, figure'),
			len = childElements.length;
		
		function getElemResourceUrl(el) {
			var resUrl = '',
				elStyle;

			if (el.nodeName === 'VIDEO') {
				//TODO
			} else if (el.src) {
				resUrl = el.src;
			} else {
				elStyle = el.currentStyle || window.getComputedStyle(el, false);
				if (elStyle && elStyle.backgroundImage) {
					resUrl = elStyle.backgroundImage.slice(4, -1);
				}
			}
			return resUrl;
		}

		if (mod.dataAft2mod) {
			isAft2Module = true;
		}

		if (!customReport) {

			if (aft2StartTime > 0 && !isAft2Module) {
				//if it is aft2 calculation but the module is NOT aft2 module
				modStart = 0;
				modEnd = 0;

			} else {
				//AFT or (AFT2 calculation with AFT modules)
				// Check element itself first wheater it has a resource or not

				resourceUrl = getElemResourceUrl(mod);
				if (resourceUrl) {
					resource = perf.getEntriesByName(resourceUrl);
					if (resource && resource.length && resource.length > 0 && viewport.isInViewport(mod, true)) {
						resources.push(createEntryFromResourceTiming(resource[0]));
					}
				}

				if (childElements && len > 0) {
					// Get all child elements which has media module which requires http requests
					for (i =0; i < len; i += 1) {
						elem = childElements[i];
						resourceUrl = getElemResourceUrl(elem);
						if (resourceUrl) {
							resource = perf.getEntriesByName(resourceUrl);
							if (resource && resource.length && resource.length > 0 && viewport.isInViewport(elem, true)) {
								resources.push(createEntryFromResourceTiming(resource[0]));
							}
						}
					}
				}
				len = resources.length;
				if (len > 0) {
					for (i =0; i < len; i += 1) {
						if (aft2StartTime > 0 && isAft2Module) {
							//if it is aft2 calculation and the module is aft2 module
							resources[i].start -= aft2StartTime;
							resources[i].durationFromNStart -= aft2StartTime;
							if (resources[i].start <= 0) {
								resources[i].start = modStart;
							}
							if (resources[i].durationFromNStart <= 0) {
								resources[i].durationFromNStart = modEnd;
							}
						} 

						if (resources[i].start > modStart) {
							modStart = resources[i].start;
						}
						if (resources[i].durationFromNStart > modEnd) {
							modEnd = resources[i].durationFromNStart;
						}
					}
				}
			}

		} else {
			//Custom report
			isCustom = true;
			modStart = customReport.modStart ? customReport.modStart : modStart;
			modEnd = customReport.modEnd ? customReport.modEnd : modEnd;
			if (aft2StartTime) {
				if (modStart > aft2StartTime) {
					modStart -= aft2StartTime;
				} else {
					modStart = 0;
				}
				if (modEnd > aft2StartTime) {
					modEnd -= aft2StartTime;
				} else {
					modEnd = 0;
				}
			}
		}

		return {
			isCustom: isCustom,
			isAft2Module: isAft2Module,
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
			modCov = 0,
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
	function getAFT(modsReport) {
		var aboveFoldTime = 0, //aka Speedindex
			rnow = perf.now() - aft2StartTime, //right now from navigation timing api
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
		for (key in modsReport){
			if (modsReport.hasOwnProperty(key) && modsReport[key].inViewPort && Math.round(modsReport[key].coveragePercentage) > 0) {
				if (confs.useNormalizeCoverage) {
					modsReport[key].normCoveragePercentage =  (modsReport[key].coveragePercentage / totalCoveragePercentage) * 100;
					normTotCovPerc += modsReport[key].normCoveragePercentage;
				}

				if (modsReport[key].loadTime >= 0) {
					i = Math.round(modsReport[key].loadTime / 100);
					aftIntervals[i] += confs.useNormalizeCoverage ? modsReport[key].normCoveragePercentage: modsReport[key].coveragePercentage;
				}
			}
		}


		if (confs.useNormalizeCoverage) {
			aboveFoldTime += (normTotCovPerc - aftIntervals[0]);
		} else {
			aboveFoldTime += (totalCoveragePercentage - aftIntervals[0]);
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
	function getHttpRequestsReport(reqs){
		var httpReqReport = {},
			i = 0,
			cached = 0,
			plt = YAFT.getPageLoadTime(),
			onloadCount = 0,
			onloadCached = 0;
		httpReqReport.count = reqs.length;
		for (i = 0; i < httpReqReport.count; i += 1) {
			if (reqs[i].start <= plt) {
				onloadCount += 1;
			}
			if (reqs[i].duration <= 0) {
				cached += 1;
				if (reqs[i].start <= plt) {
					onloadCached += 1;
				}
			}
		}
		httpReqReport.cached = cached;
		httpReqReport.nonCached = httpReqReport.count - cached;
		httpReqReport.onloadCount = onloadCount;
		httpReqReport.onloadCached = onloadCached;
		httpReqReport.onloadNonCached = onloadCount - onloadCached;

		return httpReqReport;
	}

	function startAft2() {
		modules = {};
		modulesReport = {};
		if (!perfExists || !isInitialized) {
			return false;
		}

		//first remove the report
		if (showReport === true && confs.canShowVisualReport && w.YAFT_REPORT && w.YAFT_REPORT.removeReport) {
			w.YAFT_REPORT.removeExtras();
			w.YAFT_REPORT.removeReport();
		}
		//if aft2 and aft setTimeout id are on, kill it
		if (aftTimer) {
			clearTimeout(aftTimer);
		}
		if (aft2Timer) {
			clearTimeout(aft2Timer);
		}
		aft2StartTime = perf.now(); // 1000ms
		aft2NavStart = aft2StartTime + startTime;
	}

	function endAft2(callback) {
		var data = {},
			aftData = {},
			modsReport = {},
			har = {},
			domElementsCount = 0;

		if (!perfExists || !isInitialized) {
			callback(null, 'Nav or resource timing or both are not available or YAFT is not initialized');
			return false;
		}

		aft2EndTime = perf.now(); // 1200ms
		aft2StartRender = aft2EndTime - aft2StartTime;
		
		if (confs.maxWaitTime && confs.maxWaitTime > 0) {
			aft2Timer = setTimeout(function() {
				if (!viewport) {
					viewport = getViewPortObject();
				}

				timings = getTimings();

				domElementsCount = YAFT.getDomElementsCount();

				getAndSetModules(confs.modules, confs.modulesExclude, confs.modulesAft2Container);

				prepareModulesReport(modules);

				modsReport = YAFT.getFinalModulesReport();
				
				//1.5 get total coverage
				totalCoveragePercentage = getTotalCoverage(modsReport);

				//1.5 finanlly calculate AFT
				aftData = getAFT(modsReport);
				normTotalCoveragePercentage = aftData.normTotalCoveragePercentage;

				//4. Calculate Visually Complete
				visuallyComplete = getVisuallyComplete(aftData.aftIntervals);

				if (confs.generateHAR) {
					har = getHAR(timings);
				}

				data = {
					aft: aftData.aft,
					startRender: aft2StartRender,
					event: 'aft2',
					modulesReport: modsReport,
					totalCoveragePercentage: totalCoveragePercentage,
					normTotalCoveragePercentage: normTotalCoveragePercentage,
					domElementsCount: domElementsCount,
					resources: timings,
					har: har,
					visuallyComplete: visuallyComplete
				};

				if (callback) {
					callback(data);
					YAFT.data.push(data);
				}
				//lastly draw the report
				if (showReport === true && confs.canShowVisualReport && w.YAFT_REPORT && w.YAFT_REPORT.drawReport) {
					w.YAFT_REPORT.drawReport(data, aftData.aftIntervals);
				}

			}, confs.maxWaitTime);
		}		
	}

	function finalResult(evnt, callback) {
		var data = {},
			aftData = {},
			pageLoadTime = YAFT.getPageLoadTime(),
			domContentLoaded = YAFT.getDomContentLoaded(),
			domElementsCount = YAFT.getDomElementsCount(),
			ttfb = YAFT.getTTFB(),
			domInteractive = YAFT.getDomInteractive(),
			modsReport = {},
			har = {},
			httpRequests = {},
			prePlugins = [],
			postPlugIns = [],
			i;

		startRender = YAFT.getStartRenderTime();
		timings = getTimings();
		if (!(timings && timings.length && timings.length > 0)) {
			callback(null, 'No timings available');
			return;
		}

		if(confs.plugins) {
			for(i = 0; i < confs.plugins.length; i += 1) {
				if(window['yaft_' + confs.plugins[i].name]) {
					if (confs.plugins[i].isPre) {
						prePlugins.push(confs.plugins[i]);
						YAFT.logToConsole('YAFT plugin ' + confs.plugins[i].name + ' will be executed before the callback');
					} else {
						postPlugIns.push(confs.plugins[i]);
						YAFT.logToConsole('YAFT plugin ' + confs.plugins[i].name + ' will be executed after the callback');
					}
				}
				else {
					YAFT.logToConsole('YAFT plugin ' + confs.plugins[i].name + ' not found');
				}
			}
		}

		//1. Calculate AFT
		//1.2 get viewport
		if (!viewport) {
			viewport = getViewPortObject();
		}

		//1.3 get all modules and set to modules variable
		getAndSetModules(confs.modules, confs.modulesExclude, confs.modulesAft2Container);
		
		//1.4 prepare module report which sets to "modulesReport" variable
		prepareModulesReport(modules);

		// I could have just used just "modulesReport" variable but I needed this to make unit test working
		modsReport = YAFT.getFinalModulesReport();

		//1.5 get total coverage
		totalCoveragePercentage = getTotalCoverage(modsReport);

		//1.5 finanlly calculate AFT
		aftData = getAFT(modsReport);
		normTotalCoveragePercentage = aftData.normTotalCoveragePercentage;

		//2. Get costly resources
		costlyResources = getCostlyResources();

		//3. Get httpRequests
		httpRequests = getHttpRequestsReport(costlyResources);

		//4. Calculate Visually Complete
		visuallyComplete = getVisuallyComplete(aftData.aftIntervals);

		if (confs.generateHAR) {
			har = getHAR(timings);
		}

		data = {
			aft: aftData.aft,
			pageLoadTime: pageLoadTime,
			startRender: startRender,
			domInteractive: domInteractive,
			domContentLoaded: domContentLoaded,
			ttfb: ttfb,
			event: evnt,
			modulesReport: modsReport,
			totalCoveragePercentage: totalCoveragePercentage,
			normTotalCoveragePercentage: normTotalCoveragePercentage,
			domElementsCount: domElementsCount,
			resources: timings,
			har: har,
			costlyResources: costlyResources,
			httpRequests: httpRequests,
			visuallyComplete: visuallyComplete
		};

		//execute pre plugins before the callback
		for(i = 0; i < prePlugins.length; i += 1) {
			try {
				window['yaft_' + prePlugins[i].name].execute(prePlugins[i].config, data);
			}
			catch(e) {
				YAFT.logToConsole('YAFT plugin ' + prePlugins[i].name + ' failed to execute');
				YAFT.logToConsole(e);
			}
		}

		//call the callback
		if (callback) {
			YAFT.logToConsole(data);
			YAFT.logToConsole(aftData.aftIntervals);
			callback(data);
			YAFT.data.push(data);
		}

		//execute post plugins after the callback
		for(i = 0; i < postPlugIns.length; i += 1) {
			try {
				window['yaft_' + postPlugIns[i].name].execute(postPlugIns[i].config, data);
			}
			catch(e) {
				YAFT.logToConsole('YAFT plugin ' + postPlugIns[i].name + ' failed to execute');
				YAFT.logToConsole(e);
			}
		}

		//lastly draw the report
		if (showReport === true && confs.canShowVisualReport && w.YAFT_REPORT && w.YAFT_REPORT.drawReport) {
			w.YAFT_REPORT.drawReport(data, aftData.aftIntervals);
		}
	}

	function triggerPerf(evnt, callback) {
		if (isLoadFired || !isInitialized) {
			return;
		}
		isLoadFired = true;

		if (!perfExists) {
			callback(null, 'Nav or resource timing or both are not available');
			return false;
		}

		//add extra wait
		if (confs.maxWaitTime && confs.maxWaitTime > 0) {

			aftTimer = setTimeout(function(){
				finalResult(evnt, callback);
			}, confs.maxWaitTime);

		} else {
			finalResult(evnt, callback);
		}
	}

	w.YAFT = {
		data: [],
		/**
		 * triggers YAFT's final perf metric calculations. If you want to use this function, run YAFT.init first.
		 * @param {string} evnt event name. callback
		 * @param {function} callback callback function which will get the YAFT final result in the second param
		 */	
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
					viewport = getViewPortObject();
				}
		
				//add to modules and modulesReport
				if (this.getConfig().useCustomSelector) {
					nList = d.querySelectorAll(mod);
				} else {
					nList = d.querySelectorAll('div[id^="' + mod + '"], section[id^="' + mod + '"], ul[id^="' + mod + '"]');
				}

				if (nList && nList.length>0) {
					el = nList[0];

					//modules[id] = module
					modules[el.id] = el;

					//add to modules report
					prepareCustomModuleReport(el, { 
						modStart: startTime,
						modEnd: endTime
					});
				}
			}
		},
		
		/**
		 * Gets final modules report
		 * @returns {object} modules report
		 */	
		getFinalModulesReport: function () {
			return modulesReport;
		},

		/**
		 * resets YAFT private variables.
		 */	
		reset: function() {
			isInitialized = true;
			isLoadFired =false; // TODO: remove event handler
			modules = [];
		},

		/**
		 * Checks if Navigation and Resource Timing APIs exist or not
		 * @returns {bool}
		 */	
		perfExists: function() {
			return perfExists;
		},

		/**
		 * Checks if YAFT.init function is already called or not. Use YAFT.reset() first to reinit the YAFT
		 * @returns {bool}
		 */	
		isInitialized: function() {
			return isInitialized;
		},

		/**
		 * Gets config object which will be used for YAFT configuration
		 * @returns {object}
		 */	
		getConfig: function() {
			return confs;
		},
		
		/**
		 * Gets window.performance object if it exists
		 * @returns {object}
		 */	
		getPerformance: function() {
			return w.performance || w.webkitPerformance || w.msPerformance || w.mozPerformance || w.Performance;
		},

		/**
		 * Gets window.requestAnimationFrame object if it exists. 
		 * @returns {object}
		 */	
		getRequestAnimationFrame: function() {
			return w.requestAnimationFrame || w.webkitRequestAnimationFrame || w.mozRequestAnimationFrame || w.msRequestAnimationFrame || function(cb) { return w.setTimeout(cb, 1000 / 60); };
		},
		
		init: function(configs, callback) {
			var key;
			//reset everthing first
			this.reset();

			perf = this.getPerformance();

			if (perf && perf.timing && (perf.getEntriesByType !== undefined || perf.webkitGetEntriesByType !== undefined)) {
				startTime = perf.timing.navigationStart;
				perf.now = perf.now || perf.webkitNow || perf.msNow || perf.mozNow || function () { return new Date().getTime() - startTime; };
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

			if (perf.timing.loadEventStart > perf.timing.navigationStart){
				//if onlaod is already fired, trigger aft calculation
				YAFT.triggerPerf('deferred', callback);
			} else {
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
			}
		},
		AFT2: {
			start: startAft2,
			end: endAft2
		},
		getDomElementsCount: function(){
			//it is exactly what WPT does but this shows a lot more. Why?
			//https://code.google.com/p/webpagetest/source/browse/trunk/agent/browser/chrome/extension/wpt/script.js#77
			return d.getElementsByTagName('*').length;
		},
		getTTFB: function() {
			return perfExists ? perf.timing.responseStart - startTime : 0;
		},
		getPageLoadTime: function(){
			return perfExists ? perf.timing.loadEventStart - startTime : 0;
		},
		getDomContentLoaded: function(){
			return perfExists ? perf.timing.domContentLoadedEventStart - startTime : 0;
		},
		getStartRenderTime: function() {
			var dclt, firstPaint, chromeTimes, slt;
			if (!perfExists) {
				return 0;
			}
			dclt = this.getDomContentLoaded();
			// If the browser supports a first paint event, just use what the browser reports
			if ('msFirstPaint' in w.performance.timing) {
				firstPaint = w.performance.timing.msFirstPaint - startTime;
			} else if ('chrome' in w && 'loadTimes' in w.chrome && w.chrome.loadTimes) {
				chromeTimes = w.chrome.loadTimes();
				if ('firstPaintTime' in chromeTimes && chromeTimes.firstPaintTime > 0) {
					slt = chromeTimes.startLoadTime;
					if ('requestTime' in chromeTimes) {
						slt = chromeTimes.requestTime;
					}
					if (chromeTimes.firstPaintTime >= slt) {
						firstPaint = (chromeTimes.firstPaintTime - slt) * 1000.0;
					}
				}
			}
			// If we get insane values or firstPaint is not supported, use domContentLoadedEventStart for the last resort
			if (firstPaint === undefined || firstPaint < 0 || (firstPaint > 120000 && firstPaint > dclt)) {
				return dclt;
			}
			return firstPaint;
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
		getViewport: function() {
			return viewport;
		},
		//log to console
		logToConsole: function(obj) {
			if (perfExists && showReport && console && console.log) {
				console.log(obj);
			}
		}
	};
})(window, document);
;(function (w, d) {
	'use strict';

	//waterfall
	var xmlns = 'http://www.w3.org/2000/svg',
		barColors = {
			blocked: 'rgb(204, 204, 204)',
			thirdParty: 'rgb(0, 0, 0)',
			redirect: 'rgb(255, 221, 0)',
			appCache: 'rgb(161, 103, 38)',
			dns: 'rgb(48, 150, 158)',
			tcp: 'rgb(255, 157, 66)',
			ssl: 'rgb(213,102, 223)',
			request: 'rgb(64, 255, 64)',
			response: 'rgb(52, 150, 255)'
		},
		isWFShown = false,
		isWFDrawn = false,
		extraData = [];

	function addExtra(yaftDataProbName) {
		var extElem, dataContainer = d.getElementById('yaft-data-container');
		extraData.push(yaftDataProbName);
		if (dataContainer) {
			extElem = d.createElement('li');
			extElem.innerHTML = getExtraElement(yaftDataProbName);
			dataContainer.appendChild(extElem);
		}
	}
	function removeExtras() {
		extraData = [];
	}

	function toggleWaterfall() {
		var yaftWfCnt = document.getElementById('waterfall-div');
		if (yaftWfCnt) {
			if (isWFShown) {
				//close
				isWFShown = false;
				yaftWfCnt.style.visibility = 'hidden';
			} else {
				//show
				yaftWfCnt.style.visibility = 'visible';
				isWFShown = true;
			}
		}
	}

	function drawVisReport(container, visProgress) {
		var svg = createSVG(container.offsetWidth, container.offsetHeight),
			n = 0,
			numberOfLines = visProgress.length,
			xratio = (container.offsetWidth) / numberOfLines,
			yratio = (container.offsetHeight -2 ) / 100;

		container.appendChild(svg);
		for (n = 0; n < numberOfLines; n += 1) {
			svg.appendChild(createSVGLine(
				(n * xratio),
				container.offsetHeight - 2,
				(n * xratio),
				container.offsetHeight - 2 - (yratio * visProgress[n]),
				'stroke: #ccc;stroke-width:'+xratio)
			);
		}
	}

	/**
     * Draw waterfall
     * @param {object[]} entries
     */
	function drawWaterfall(data) {
		var entries =  data.resources,
            maxTime = 0,
			n = 0,
			containerID = 'waterfall-div',
			rowHeight = 10,
			rowPadding = 2,
			barOffset = 200,
			container = d.createElement('div'),
			width = 1000,
			height = (entries.length + 1) * (rowHeight + rowPadding), // +1 for axis
			intervalTimeFrame = 1000, //1000ms and can be configurable 100, 200, 500, 1000, 2000
			svg = createSVG(width, height);

		for(n = 0; n < entries.length; n++) {
			maxTime = Math.max(maxTime, entries[n].durationFromNStart);
		}

		container.id = containerID;
		container.style.cssText = 'background:#fff;border: 2px solid #000;margin:5px;position:absolute;top:0px;left:0px;z-index:2147483646;margin:0px;padding:0px;';
		d.body.appendChild(container);

		//calculate size of chart
		// - max time
		// - number of entries
		container.width = width;
		container.height = height;
		


		//width can be configurable (maxWidth) 
		//maxTime comes from resource timing api
		if (maxTime <= 200){
			intervalTimeFrame = 20;
		} else if (maxTime > 200 && maxTime <= 500) {
			intervalTimeFrame = 100;
		} else if (maxTime > 500 && maxTime <= 2000) {
			intervalTimeFrame = 200;
		} else if (maxTime > 16000 && maxTime <= 40000) {
			intervalTimeFrame = 2000;
		} else if (maxTime > 40000) {
			intervalTimeFrame = 5000;
		}


		var	intervalWidth = (intervalTimeFrame * (width - 5 - barOffset)) / maxTime, //interval
			scaleFactor = intervalTimeFrame / intervalWidth,
			numberOfLines = maxTime / intervalTimeFrame,
			x1 = barOffset,
			y1 = rowHeight + rowPadding,
			y2 = height;


		for(n = 0; n <= numberOfLines; n++) {
			svg.appendChild(createSVGText(x1, 0, 0, rowHeight, 'font: 10px sans-serif;', 'middle', n*intervalTimeFrame));
			svg.appendChild(createSVGLine(x1, y1, x1, y2, 'stroke: #ccc;'));
			x1 += intervalWidth;
		}

		//load time
		x1 = barOffset + (data.pageLoadTime /scaleFactor);
		svg.appendChild(createSVGText(x1, 0, 0, rowHeight, 'font: 10px sans-serif;', 'middle', ''));
		svg.appendChild(createSVGLine(x1, y1, x1, y2, 'stroke: #F00;'));

		
		// draw resource entries
		for(n = 0; n < entries.length; n++) {
			var entry = entries[n]; 
			var row = createSVGGroup('translate(0,' + (n + 1) * (rowHeight + rowPadding) + ')');
			row.appendChild(drawTooltip(entry));
			row.appendChild(createSVGText(5, 0, 0, rowHeight, 'font: 10px sans-serif;', 'start', shortenURL(entry.url)));
			row.appendChild(drawBar(entry, barOffset, rowHeight, scaleFactor));
			svg.appendChild(row);
			//console.log(JSON.stringify(entry) + "\n" );
		}
		container.appendChild(svg);
	}

	function drawTooltip(entry) {
		var titEl = document.createElementNS(xmlns, 'title'),
			textContent = entry.url + '\n\n';
		if (entry.dnsDuration > 0) {
			textContent += 'DNS Lookup:' + entry.dnsDuration + '\n';
		}
		if (entry.tcpDuration > 0) {
			textContent += 'TCP Duration:' + entry.tcpDuration + '\n';
		}
		if (entry.sslDuration > 0) {
			textContent += 'SSL Duration:' + entry.sslDuration + '\n';
		}
		if (entry.requestDuration > 0) {
			textContent += 'Request Duration:' + entry.requestDuration + '\n';
		}
		if (entry.responseDuration > 0) {
			textContent += 'Response Duration:' + entry.responseDuration + '\n';
		}
		titEl.textContent = textContent;
		return titEl;
	}

	/**
     * Draw bar for resource 
     * @param {object} entry Details of URL, and timings for individual resource
     * @param {int} barOffset Offset of the start of the bar along  x axis
     * @param {int} rowHeight 
     * @param {double} scaleFactor Factor used to scale down chart elements
     * @returns {element} SVG Group element containing bar
     *
     * TODO: Scale bar using SVG transform? - any accuracy issues?
     */
	function drawBar(entry, barOffset, rowHeight, scaleFactor) {

		var bar = createSVGGroup('translate(' + barOffset + ', 0)');

		if(entry.duration > 0) {
			bar.appendChild(createSVGRect(entry.start / scaleFactor, 0, entry.duration / scaleFactor, rowHeight, 'fill:' + barColors.blocked));
		} else {
			//cache
			bar.appendChild(createSVGRect(entry.start / scaleFactor, 0, 2, rowHeight, 'fill:' + barColors.blocked));
		}
		// TODO: Test for 3rd party and colour appropriately

		if(entry.redirectDuration > 0) {
			bar.appendChild(createSVGRect(entry.redirectStart / scaleFactor , 0, entry.redirectDuration / scaleFactor, rowHeight, 'fill:' + barColors.redirect));
		}

		if(entry.appCacheDuration > 0) {
			bar.appendChild(createSVGRect(entry.appCacheStart / scaleFactor , 0, entry.appCacheDuration / scaleFactor, rowHeight, 'fill:' + barColors.appCache));
		}

		if(entry.dnsDuration > 0) {
			bar.appendChild(createSVGRect(entry.dnsStart / scaleFactor , 0, entry.dnsDuration / scaleFactor, rowHeight, 'fill:' + barColors.dns));
		}

		if(entry.tcpDuration > 0) {
			bar.appendChild(createSVGRect(entry.tcpStart / scaleFactor , 0, entry.tcpDuration / scaleFactor, rowHeight, 'fill:' + barColors.tcp));
		}

		if(entry.sslDuration > 0) {
			bar.appendChild(createSVGRect(entry.sslStart / scaleFactor , 0, entry.sslDuration / scaleFactor, rowHeight, 'fill:' + barColors.ssl));
		}

		if(entry.requestDuration > 0) {
			bar.appendChild(createSVGRect(entry.requestStart / scaleFactor , 0, entry.requestDuration / scaleFactor, rowHeight, 'fill:' + barColors.request));
		}

		if(entry.responseDuration > 0) {
			bar.appendChild(createSVGRect(entry.responseStart / scaleFactor , 0, entry.responseDuration / scaleFactor, rowHeight, 'fill:' + barColors.response));
		}

		return bar;
	}

	// drawBarSegment - start, length, height, fill
	/**
     * Shorten URLs over 40 characters
     * @param {string} url URL to be shortened
     * @returns {string} Truncated URL
     *
     * TODO: Remove protocol
     */
	function shortenURL(url) {
		var shorterURL = url;
		if(url.length > 40) {
			shorterURL = url.slice(0, 17) + ' ... ' + url.slice(-20);
		}
		return shorterURL;
	}

	/**
     * Create SVG element
     * @param {int} width
     * @param {int} height
     * @returns {element} SVG element
     */
	function createSVG(width, height) {
		var el = document.createElementNS(xmlns, 'svg');
 
		el.setAttribute('width', width);
		el.setAttribute('height', height);
    
		return el;
	}

	/**
     * Create SVG Group element
     * @param {string} transform SVG tranformation to apply to group element
     * @returns {element} SVG Group element
     */
	function createSVGGroup(transform) {		
		var el = document.createElementNS(xmlns, 'g');
 
		el.setAttribute('transform', transform);
    
		return el;
	}

	/**
     * Create SVG Rect element
     * @param {int} x
     * @param {int} y
     * @param {int} width
     * @param {int} height
     * @param {string} style
     * @returns {element} SVG Rect element
     */
	function createSVGRect(x, y, width, height, style) {
		var el = document.createElementNS(xmlns, 'rect');
 
		el.setAttribute('x', x);
		el.setAttribute('y', y);
		el.setAttribute('width', width);
		el.setAttribute('height', height);
		el.setAttribute('style', style);

		return el;
	}

	/**
     * Create SVG Rect element
     * @param {int} x1
     * @param {int} y1
     * @param {int} x2
     * @param {int} y2
     * @param {string} style
     * @returns {element} SVG Line element
     */
	function createSVGLine(x1, y1, x2, y2, style) {
		var el = document.createElementNS(xmlns, 'line');

		el.setAttribute('x1', x1);
		el.setAttribute('y1', y1);
		el.setAttribute('x2', x2);
		el.setAttribute('y2', y2);
		el.setAttribute('style', style);

		return el;
	}

	/**
     * Create SVG Text element
     * @param {int} x
     * @param {int} y
     * @param {int} dx
     * @param {int} dy
     * @param {string} style
     * @param {string} anchor
     * @param {string} text
     * @returns {element} SVG Text element
     */
	function createSVGText(x, y, dx, dy, style, anchor, text, evt) {
		var el = document.createElementNS(xmlns, 'text');
		el.setAttribute('x', x);
		el.setAttribute('y', y);
		el.setAttribute('dx', dx);
		el.setAttribute('dy', dy);
		el.setAttribute('style', style);
		el.setAttribute('text-anchor', anchor);
		if (evt) {
			el.setAttribute('onclick', evt);
		}
		el.appendChild(document.createTextNode(text));

		return el;
	}




	//Draw reporting section starts
	function closeReport(){
		var style = d.createElement('style'),
			css = '.aft-data-containter {display: none;} #waterfall-div {display:none;}';
		style.setAttribute('type', 'text/css');
		style.appendChild(d.createTextNode(css));
		d.getElementsByTagName('head')[0].appendChild(style);
	}

	function drawData(modData) {
		var el = d.createElement('div'),
                         resTimes,
                         resCount = modData.resources.length,
                         n;

                resTimes = '<li> Resource load times: ';
                for(n=0; n < resCount; n += 1) { 
                        resTimes = resTimes + '<li><a href="' + 
                                   modData.resources[n].url + 
                                   '" title="' + 
                                   modData.resources[n].url + '">' +  
                                   Math.round(modData.resources[n].durationFromNStart) + ' ms </a></li>';
                }      

		el.className = 'aft-data-containter';
		el.innerHTML = '<div class="aft-data"><ul>'+
								'<li>Module: ' + modData.name + '</li>'+
								'<li>Load time: ' + Math.round(modData.loadTime) + ' ms</li>'+
								'<li>Coverage: ' + Math.round(modData.coveragePercentage) + '%</li>'+
								'<li>In viewport: ' + modData.inViewPort + '</li>'+
                                                                 resTimes+
							'</ul></div>';
		return el;
	}

	function drawModuleReport(mod) {
		var dataElem, 
			thisBounds;
		if (mod.coveragePercentage > 0) {
			dataElem = drawData(mod);
			thisBounds = w.YAFT.getViewport().getElementBounds(mod.name);
			//thisBounds = d.getElementById(mod.name).getBoundingClientRect();
			//dataElem.style.top = '-' + thisBounds.height + 'px';
			//d.getElementById(mod.name).appendChild(dataElem);
			dataElem.style.position = 'absolute';
			dataElem.style.top = thisBounds.top+'px';
			dataElem.style.left = thisBounds.left+'px';
			d.body.appendChild(dataElem);
		}
	}

	function drawReportStyle() {
		// ADD THE CSS STYLES REQUIRED
		var style = d.createElement('style'),
			css = '.aft-data-containter {' +
						'text-align: left;' +
						'position: relative;' +
						'height: 0px;' +
						'z-index: 2147483645;' +
					'}' +
					'.aft-data, .aft-data a {' +
						'color: rgb(200, 200, 200); ' +
						'color: rgba(255, 255, 255, .7); ' +
						'background: rgb(100, 100, 100); ' +
						'background: rgba(000, 000, 000, .5); ' +
						'display: inline-block;' +
						'font-size: 12px;' +
						'font-weight: bolder;' +
					'}' +
					'.aft-data ul {' +
						'margin: 0;' +
						'padding: 0 15px;' +
					'}';

		style.setAttribute('type', 'text/css');
		style.appendChild(d.createTextNode(css));
		d.getElementsByTagName('head')[0].appendChild(style);
	}
	function getExtraElement (extData, data) {
		var extraDataName = extData.name,
			extraDataTitle = extData.title,
			extraDataVal = extData.value;

		if (!extraDataTitle && extraDataName) {
			extraDataTitle = extraDataName;
		}
		if (!extraDataVal && extraDataName && data && data[extraDataName]) {
			extraDataVal = data[extraDataName];
		}
		if (extData.isNumeric && extData.needsRounding) {
			extraDataVal = Math.round(extraDataVal);
		}
		return '<li>' + extraDataTitle + ': ' + extraDataVal + '</li>';
	}
	function removeReport() {
		var el, elems;
		el = document.getElementById('aft-data-containter');
		if (el) {
			d.body.removeChild(el);
		}
		el = document.getElementById('waterfall-div');
		if (el) {
			d.body.removeChild(el);
		}
		elems = document.getElementsByClassName('aft-data-containter');
		if (elems && elems.length) {
			while(elems.length > 0){
				elems[0].parentNode.removeChild(elems[0]);
			}
		}
	}
	function drawReport (data, aftIntervals) {
		var el,
			wf,
			visProgess,
			key,
			i = 0,
			extraDataLen = extraData.length,
			extraDataTitle = '',
			extraDataVal = '',
			extraDataName = '',
			innerLiHtml ='',
			mods;
		if (w.YAFT === undefined && data === undefined) {
			return false;
		}
		removeReport();
		drawReportStyle();

		el = d.createElement('div');
		//el.id = ""
		el.className = 'aft-data-containter';
		el.id = 'aft-data-containter';
		el.style.position = 'absolute';
		el.style.top = '0px';
		el.style.right = '0px';
		el.style.zIndex = '2147483646';
		if (data.aft) innerLiHtml += '<li>AFT: ' + Math.floor(data.aft) + '</li>';
		if (data.pageLoadTime) innerLiHtml += '<li>PLT: ' + data.pageLoadTime + '</li>';
		if (data.domContentLoaded) innerLiHtml += '<li>DomContentLoaded: ' +  Math.floor(data.domContentLoaded) + '</li>';
		if (data.startRender) innerLiHtml += '<li>Start Render: ' +  Math.floor(data.startRender) + '</li>';
		if (data.domInteractive) innerLiHtml += '<li>Dom Interactive: ' +  Math.floor(data.domInteractive) + '</li>';
		if (data.visuallyComplete) innerLiHtml += '<li>Visually Complete: ' + Math.floor(data.visuallyComplete) + '</li>';
		if (data.httpRequests) innerLiHtml += '<li>HTTP Requests PLT: ' + data.httpRequests.onloadCount + ' (Cached: '+ data.httpRequests.onloadCached +')</li>';
		if (data.httpRequests) innerLiHtml += '<li>HTTP Requests: ' + data.httpRequests.count + ' (Cached: '+ data.httpRequests.cached +')</li>';
		if (data.totalCoveragePercentage) innerLiHtml += '<li>Total Coverage: ' + Math.round(data.totalCoveragePercentage) +'%</li>';
		if (data.normTotalCoveragePercentage) innerLiHtml += '<li>N Total Coverage: ' + Math.round(data.normTotalCoveragePercentage) +'%</li>';

		if (extraDataLen > 0) {
			for (i = 0; i < extraDataLen; i += 1) {
				innerLiHtml += getExtraElement(extraData[i], data);
			}
		}

		el.innerHTML = '<div class="aft-data"><ul id="yaft-data-container">'+innerLiHtml+'</ul>' +
							'<div id="aft-report-visprogress" style="height:150px;border:solid 1px white;"></div>'+
							'<a id="aft-report-waterfall" style="position:absolute;top:0px;right:15px;color:white;border:1px solid white;" href="#">WF</a>' +
							'<a id="aft-report-close" style="position:absolute;top:0px;right:0px;color:white;border:1px solid white;" onclick="YAFT_REPORT.closeReport();" href="#">X</a>' +
						'</div>';
		d.body.appendChild(el);

		for (key in data.modulesReport){
			if (data.modulesReport.hasOwnProperty(key)) {
				drawModuleReport(data.modulesReport[key]);
			}
		}

		wf = d.getElementById('aft-report-waterfall');
		wf.onclick = function(){
			if (!isWFDrawn) {
				drawWaterfall(data);
				isWFDrawn = true;
				isWFShown = true;
			} else {
				toggleWaterfall();
			}
		};

		visProgess = d.getElementById('aft-report-visprogress');
		drawVisReport(visProgess, aftIntervals);
		//alert(visProgess.offsetWidth + ' x ' + visProgess.offsetHeight);

	}
	w.YAFT_REPORT = {
		drawReport: drawReport,
		drawWaterfall: drawWaterfall,
		removeReport: removeReport,
		closeReport: closeReport,
		addExtra: addExtra,
		removeExtras: removeExtras,
		toggleWaterfall: toggleWaterfall
	};
	//Reporting section ends
})(window, document);
