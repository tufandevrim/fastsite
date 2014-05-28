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
	};

	/**
     * Draw waterfall
     * @param {object[]} entries
     */
	function drawWaterfall(entries) {

		var maxTime = 0,
			n = 0,
			containerID = 'waterfall-div',
			closescript = 'var yaft_wf_cnt = document.getElementById("'+containerID+'"); yaft_wf_cnt.style.visibility="hidden";',
			rowHeight = 10,
			rowPadding = 2,
			barOffset = 200;

		for(n = 0; n < entries.length; n++) {
			maxTime = Math.max(maxTime, entries[n].durationFromNStart);
		}

		var container = document.getElementById(containerID),
			width = 1000,
			height = (entries.length + 1) * (rowHeight + rowPadding), // +1 for axis
			svg = createSVG(width, height);

		
		container = document.createElement('div');
		container.id = containerID;

		container.style.cssText = 'background:#fff;border: 2px solid #000;margin:5px;position:absolute;top:0px;left:0px;z-index:99999;margin:0px;padding:0px;';
		document.body.appendChild(container);

		//calculate size of chart
		// - max time
		// - number of entries
		container.width = width;
		container.height = height;
		


		//width can be configurable (maxWidth) 
		//maxTime comes from resource timing api
		var intervalTimeFrame = 1000; //1000ms and can be configurable 100, 200, 500, 1000, 2000
		if (maxTime <= 200){
			intervalTimeFrame = 20;
		} else if (maxTime > 200 && maxTime <= 500) {
			intervalTimeFrame = 100;
		} else if (maxTime > 500 && maxTime <= 2000) {
			intervalTimeFrame = 200;
		} else if (maxTime > 16000) {
			intervalTimeFrame = 2000;
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
		x1 = barOffset + ((performance.timing.loadEventEnd - performance.timing.navigationStart) /scaleFactor);
		svg.appendChild(createSVGText(x1, 0, 0, rowHeight, 'font: 10px sans-serif;', 'middle', ''));
		svg.appendChild(createSVGLine(x1, y1, x1, y2, 'stroke: #F00;'));

		
		// draw resource entries
		for(n = 0; n < entries.length; n++) {
			var entry = entries[n]; 
			var row = createSVGGroup('translate(0,' + (n + 1) * (rowHeight + rowPadding) + ')');
			row.appendChild(createSVGText(5, 0, 0, rowHeight, 'font: 10px sans-serif;', 'start', shortenURL(entry.url)));
			row.appendChild(drawBar(entry, barOffset, rowHeight, scaleFactor));
			svg.appendChild(row);
			//console.log(JSON.stringify(entry) + "\n" );
		}

		svg.appendChild(createSVGText(2, 0, 0, rowHeight, 'font: 12px sans-serif;', 'start', 'hide', closescript));

		container.appendChild(svg);
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
			css = '.aft-data-containter {' +
						'display: none;' +
					'} \n ';
		style.setAttribute('type', 'text/css');
		style.appendChild(d.createTextNode(css));
		d.getElementsByTagName('head')[0].appendChild(style);


	}

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
						'z-index: 99999;' +
					'}' +
					'.aft-data {' +
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

	function drawReport(data) {
		var el,
			wf,
			key,
			mods;
		if (w.YAFT === undefined && data === undefined) {
			return false;
		}

		drawReportStyle();

		el = d.createElement('div');
		el.className = 'aft-data-containter';
		el.style.position = 'absolute';
		el.style.top = '0px';
		el.style.right = '0px';
		el.style.zIndex = '1000000';
		el.innerHTML = '<div class="aft-data"><ul>'+
								'<li>PLT: ' +  Math.floor(data.pageLoadTime) + '</li>'+
								'<li>AFT: ' + Math.floor(data.aft) + '</li>'+
								'<li>Visually Complete: ' + Math.floor(data.visuallyComplete) + '</li>'+
								'<li>HTTP Requests PLT: ' + data.httpRequests.onloadCount + ' (Cached: '+ data.httpRequests.onloadCached +')</li>'+
								'<li>HTTP Requests: ' + data.httpRequests.count + ' (Cached: '+ data.httpRequests.cached +')</li>'+
								'<li>Start Render: ' +  Math.floor(data.startRender) + '</li>'+
								'<li>Dom Interactive: ' +  Math.floor(data.domInteractive) + '</li>'+
								'<li>Total Coverage: ' + Math.round(data.totalCoveragePercentage) +'%</li>'+
								'<li>N Total Coverage: ' + Math.round(data.normTotalCoveragePercentage) +'%</li>'+
							'</ul>' +
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
			drawWaterfall(data.resources);
		};
	}
	w.YAFT_REPORT = {
		drawReport: drawReport,
		closeReport: closeReport
	};
	//Reporting section ends
})(window, document);