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
		toggleWaterfall: toggleWaterfall
	};
	//Reporting section ends
})(window, document);
