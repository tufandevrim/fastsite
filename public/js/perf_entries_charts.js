(function(){
    "use strict";
    var renderData,
        initialDataSource,
        completeDataSource,
        usingCompleteDataSource = false,
        cacheTag,
        maxTime,
        minTime,
        currentStartTime,
        currentEndTime,
        allFields,
        isCompareMode = false;

    $(function () {
        //Initialize tile filter
        allFields = //Get Fields from Source box
            (function() {
                var f = [];
                $('.source-box').each(function() { f.push($(this).val());});
                return f;
            })();

        initialDataSource = JSON.parse($('#task-data').text());
        minTime = parseInt($('#minTime').text());
        maxTime = parseInt($('#maxTime').text());
        cacheTag = $('#cacheTag').text();
        renderData = JSON.parse($('#chart-config').text());


        var i, l, j, jl = renderData.length,
            datum, property, time,
            timeFilterDisplay = $('#time-filter-time'),
            initStartTime,
            initEndTime,
            fixedBar = $('#fixedBar'),
            mainContainer = $('#main-container'),
            arrayMapStrToInt = function(str){return parseInt(str);}; //parseInt for every el in arr


        function prepareData(dataSource) {
            for (i = 0, l = dataSource.length; i < l; i++) {
                datum = dataSource[i];
                time = datum.createdAt.split('/');
                time = time.map(arrayMapStrToInt);
                time = Date.UTC(time[0],time[1]-1,time[2], time[3], time[4]);
                property = datum.testName.split('_')[1];

                for (j = 0; j < jl; j++) {
                    renderData[j].series[property] = renderData[j].series[property] || {name: property, data : []};
                }
                for (j = 0; j < jl; j++) {
                    try{
                        renderData[j].series[property].data.push({
                            x: time,
                            y: datum.data[renderData[j].percentile][renderData[j].field],
                            name: datum.taskId
                        });
                    } catch (e) {
                        console.log(e);
                    }

                }

            }

            updateFields(true);
            console.log(renderData);
        }

        //prepareData
        prepareData(initialDataSource);

        //Init slider bar
        initStartTime = maxTime - 1209600000 > minTime ? maxTime - 1209600000 : minTime; /* 2 weeks */
        initEndTime = maxTime;

        $('#time-filter-container').show();
        $('#time-filter').slider({
            min: minTime,
            max: maxTime,
            step: 60000,
            value:[initStartTime, initEndTime],
            tooltip: 'hide',
            formater: function(value) {
                return moment(value).format('MMM, D');
            }
        }).on('slideStop', function(e) {
            currentStartTime = e.value[0];
            currentEndTime = e.value[1];
            updateTimePeriod(e.value[0], e.value[1]);
        }).on('slide', function(e) {
            timeFilterDisplay.text(moment(e.value[0]).format('MMM, D, HH:mm') + ' - ' + moment(e.value[1]).format('MMM, D, HH:mm'));
        });
        timeFilterDisplay.text(moment(initStartTime).format('MMM, D, HH:mm') + ' - ' + moment(initEndTime).format('MMM, D, HH:mm'));

        $('#clickToCompare').click(function() {
            var $this = $(this);
            // $this will contain a reference to the checkbox   
            if ($this.is(':checked')) {
               // the checkbox was checked 
               isCompareMode = true;
               drawCompareReport();
            } else {
                // the checkbox was unchecked
                isCompareMode = false;
                removeCompareReport();
            }
        });

        $('.colos').click(function(env) {
            var $this = $(this);
            var box;
            // $this will contain a reference to the checkbox
            if ($this.is(':checked')) {
               // the checkbox was checked
                box = $("label[data-loc='"+env.target.value+"']"); //$(this).children('input');
                box.addClass('active').children('input').prop("checked", true);
                box.show();
                updateFields();
            } else {
                // the checkbox was unchecked
                box = $("label[data-loc='"+env.target.value+"']"); //$(this).children('input');
                box.removeClass('active').children('input').prop("checked", false);
                box.hide();
                updateFields();
            }
        });

        //Update the charts after the filter is inited
        currentStartTime = initStartTime;
        currentEndTime = initEndTime;
        updateTimePeriod(initStartTime, initEndTime);

        function updateTimePeriod (startTime, endTime) {
            var i, l;
            for (i = 0, l = renderData.length; i < l; i++) {
                renderData[i].series.chart.xAxis[0].update({min: startTime, max: endTime});
            }
        }

        // Fixed Bar config
        $( window ).scroll(function() {
            if ($(document).scrollTop() >= 51 && !fixedBar.hasClass('navbar-fixed-top')) {
                fixedBar.addClass('navbar-fixed-top');
                mainContainer.addClass('padding-for-header');
            }
            if ($(document).scrollTop() < 51 && fixedBar.hasClass('navbar-fixed-top')) {
                fixedBar.removeClass('navbar-fixed-top');
                mainContainer.removeClass('padding-for-header');
            }
        });
    });


    function updateFields(followURL) {
        var field;
        if (followURL && document.location.hash) {
            var hash = document.location.hash;
            hash = hash.slice(1, hash.length);
            var arr = hash.split(','),
                visibleFields = [];
            arr.forEach(function(str) {
                str = str.trim().toLowerCase();
                if (allFields.indexOf(str) !== -1) {
                    visibleFields.push(str);
                }
            });
            if (visibleFields.length > 0) {
                $('.source-btn').removeClass('active');
                $('.source-box').prop('checked', false);
                visibleFields.forEach(function (visibleField) {
                    $('.source-btn[data-source="'+visibleField+'"]').addClass('active');
                    $('.source-box[value="'+visibleField+'"]').prop('checked', true);
                });
            }
        }
        var fields = [];
        $('.source-box:checked').each(function() {
            fields.push($(this).val());
        });
        if (fields.length !== allFields.length){
            document.location.hash = fields.join(',');
        } else if (document.location.hash) {
            document.location.hash = '';
        }

        //If there is only one field showing, add the baseline and goals
        if (fields.length == 1) {
            fields.push(fields[0] + 'Baseline');
            fields.push(fields[0] + 'Goal');
        }
        renderAllChartsWithFields(fields);
    }

    function calculateMean(obj) {
        var timeSerie = [];
        var meanArray = [];
        var key, i, time, mean;
        for (key in obj){
            for (i = 0; i < obj[key].data.length; i++) {
                meanArray = meanArray || [];
                time = obj[key].data[i].x;
                if (!timeSerie[time]){
                    timeSerie[time] = [];
                }
                if (obj[key].data[i].y) {
                    timeSerie[time].push(obj[key].data[i].y);
                } else { //Prune all empty fields
                    obj[key].data.splice(i, 1);
                    i--;
                }

            }
        }
        for (time in timeSerie) {
            mean = arrayMean(timeSerie[time]);
            if (mean){
                meanArray.push([
                    parseInt(time),
                    mean
                ]);
            }
        }
        obj.composit = {
            name: "composit",
            data: meanArray
        };
    }

    function arrayMean(arr) {
        var sum = 0;
        for (var j = 0; j < arr.length; j++) {
            sum += arr[j];
        }
        if (arr.length !== 10){ //Only calculate mean when all properties are available
            return null;
        }else{
            return sum / arr.length;

        }
    }

    function renderAllChartsWithFields(fields) {
        var i, l, obj;
        for (i = 0, l = renderData.length; i < l; i++) {
            obj = renderData[i];
            renderChart(
                obj.title,
                obj.nodeId,
                obj.yTitle,
                obj.series,
                fields
            );
        }
    }

    function renderChart(title, node, yAxisTitle, data, fields) {
        var i, l, series = [];
        chartOption.title = {
            text: title
        };
        chartOption.yAxis.title.text = yAxisTitle;
        chartOption.chart = {
            renderTo: node,
            type: 'line',
            zoomType: 'x'
        };
        if (!data.chart) {
            data.chart = new Highcharts.Chart(chartOption);
        }
        renderSeries(data, fields);

    }

    function renderSeries(data, fields) {
        var i, l;
        while(data.chart.series.length > 0)
            data.chart.series[0].remove(false);
        for (i = 0, l = fields.length; i < l; i ++) {
            if (data[fields[i]]) {
                data.chart.addSeries(data[fields[i]], false);
            }
        }
        data.chart.redraw();
    }


    var colors = ["#7cb5ec", "#f7a35c", "#90ee7e", "#7798BF", "#aaeeee", "#ff0066", "#eeaaee",
          "#55BF3B", "#DF5353", "#7798BF", "#aaeeee"];
    Highcharts.theme = {
       colors: colors,
       chart: {
          backgroundColor: null,
          style: {
             fontFamily: "Roboto, sans-serif"
          }
       },
       title: {
          style: {
             fontSize: '16px',
             fontWeight: 'bold',
             textTransform: 'uppercase'
          }
       },
       tooltip: {
          borderWidth: 0,
          backgroundColor: 'rgba(219,219,216,0.8)',
          shadow: false
       },
       legend: {
          itemStyle: {
             fontWeight: 'bold',
             fontSize: '13px'
          }
       },
       xAxis: {
          gridLineWidth: 1,
          labels: {
             style: {
                fontSize: '12px'
             }
          }
       },
       yAxis: {
          minorTickInterval: 'auto',
          title: {
             style: {
                textTransform: 'uppercase'
             }
          },
          labels: {
             style: {
                fontSize: '12px'
             }
          }
       },
       plotOptions: {
              candlestick: {
             lineColor: '#404048'
          }
       },
       // General
       background2: '#F0F0EA'

    };


    var chartOption = {
        chart: {
            type: 'line'
        },
        title: {
            text: ''
        },
        xAxis: {
            type: 'datetime',
            dateTimeLabelFormats: { // don't display the dummy year
                month: '%e. %b',
                year: '%b'
            },
            title: {
                text: 'Date'
            },
            labels: {
                overflow: 'justify'
            }
        },
        yAxis: {
            title: {
                text: ''
            }
        },
        tooltip: {
            headerFormat: '<b>{series.name}{series.taskId}</b><br>',
            pointFormat: '{point.x:%e. %b} : {point.y: %f}<br/>TaskId={point.name}',
            useHTML: true
        },
        plotOptions:{
            series: {
                animation: false,
                turboThreshold: 100000,
                events: {
                    click: function(event) {
                        if (event.point.name) {
                            window.open('/task/' + event.point.name + '/wpt_detail/');
                        }
                    }
                }
            },
            line: {
                lineWidth: 1.5,
                states: {
                    hover: {
                        lineWidth: 2.5
                    }
                },marker: {
                    enabled: false
                }
            }
        },
        series: []
    };

    // Apply the theme
    Highcharts.setOptions(Highcharts.theme);

    // Popover Fix for Bootstrap
    // Got from http://jsfiddle.net/WojtekKruszewski/Zf3m7/22/
    var originalLeave = $.fn.popover.Constructor.prototype.leave;
    $.fn.popover.Constructor.prototype.leave = function(obj){
      var self = obj instanceof this.constructor ?
        obj : $(obj.currentTarget)[this.type](this.getDelegateOptions()).data('bs.' + this.type);
      var container, timeout;

      originalLeave.call(this, obj);

      if(obj.currentTarget) {
        container = $(obj.currentTarget).siblings('.popover');
        timeout = self.timeout;
        container.one('mouseenter', function(){
          //We entered the actual popover – call off the dogs
          clearTimeout(timeout);
          //Let's monitor popover content instead
          container.one('mouseleave', function(){
            $.fn.popover.Constructor.prototype.leave.call(self, self);
          });
        });
      }
    };
})();
