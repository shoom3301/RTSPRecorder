/**
 * Created by Shoom on 02.12.15.
 */

(function(){
    var
        fs = require('fs'),
        util = require('util'),
        events = require('events'),
        child_process = require('child_process'),
        du = require('du'),
        async = require('async'),
        ws = require('ws');

    //For websocket stream
    var STREAM_MAGIC_BYTES = 'jsmp';

    /**
     * Date to string
     * @param date {Date|undefined}
     * @returns {string}
     */
    function dateString(date){
        var dt = date || (new Date());
        return [dt.getDate(), dt.getMonth(), dt.getFullYear()].join('-')+' '
            +[dt.getHours(), dt.getMinutes(), dt.getSeconds()].join('-');
    }

    /**
     * Remove folder recursive
     * @param location {string} dir location
     * @param next {function} callback
     */
    function removeFolder(location, next) {
        fs.readdir(location, function (err, files) {
            async.each(files, function (file, cb) {
                file = location + '/' + file;
                fs.stat(file, function (err, stat) {
                    if (err) {
                        return cb(err);
                    }
                    if (stat.isDirectory()) {
                        removeFolder(file, cb);
                    } else {
                        fs.unlink(file, function (err) {
                            if (err) {
                                return cb(err);
                            }
                            return cb();
                        })
                    }
                })
            }, function (err) {
                if (err) return next(err);
                fs.rmdir(location, function (err) {
                    return next(err);
                })
            })
        })
    }

    /**
     * Rtsp stream recorder and streamer
     * @param params {object} parameters
     * @constructor
     */
    var Recorder = function(params){
        //url to stream
        this.url = '';
        //stream for frite video to file
        this.writeStream = null;
        //stream to read video from ffmpeg
        this.readStream = null;
        //read stream is started
        this._readStarted = false;
        //count of max reconnect tryes
        this.maxTryReconnect = 5;
        //max size of video directory (MB), if size more than this size dir will be cleared
        this.maxDirSize = 100;
        //width of movie clip
        this.movieWidth = 0;
        //height of movie clip
        this.movieHeight = 0;
        //limit to record one video file
        this.timeLimit = 60*10;

        params = params || {};
        for(var v in params){
            if(params.hasOwnProperty(v)) this[v] = params[v];
        }

        var self = this;

        /**
         * Logging
         */
        this.log = function(){
            for(var i in arguments){
                arguments[i] = dateString()+':: '+arguments[i].toString();
            }
            console.log.apply(this, arguments);

            return this;
        };

        /**
         * Connect to rtsp stream with ffmpeg and start record
         */
        this.connect = function(){
            this.readStream = child_process.spawn("ffmpeg",
                ["-rtsp_transport", "tcp", "-i", this.url, '-f', 'mpeg1video', '-b:v', '800k', '-r', '30', '-'],
                {detached: false}
            );

            this.readStream.stdout.on('data', function(chunk) {
                if(!self._readStarted){
                    self._readStarted = true;
                    self.emit('readStart');
                }
                self.emit('camData', chunk);
            });

            this.readStream.stderr.on('data', function(data) {
                if(self.movieWidth) return;

                data = data.toString();
                if (data && data.indexOf('Stream #0') !== -1){

                    var size = data.match(/\d+x\d+,/);

                    if (size != null) {
                        size[0] = size[0].substr(0, size[0].length-1);
                        size = size[0].split('x');

                        self.log('Movie size parsed: '+size);

                        self.movieWidth = parseInt(size[0], 10);
                        self.movieHeight = parseInt(size[1], 10);

                        self.emit('haveMovieSize');
                    }
                }
            });

            this.readStream.stdout.on('close', function() {
                self._readStarted = false;
                self.reconnect();
            });

            return this;
        };

        /**
         * Try reconnect to video stream
         * @see connect
         */
        this.reconnect = function(){
            if(this.maxTryReconnect > 0){
                this.log('Try connect to '+this.url);
                this.maxTryReconnect --;
                try{
                    this.connect();
                }catch(e){

                }
            }else{
                this.emit('lostConnection');
                this.log('Connection lost \r\n');
            }

            return this;
        };

        /**
         * Record stream to file
         */
        this.recordStream = function(){
            this.clearDir(function(){
                var filename = this.folder+this.prefix+dateString()+'.mp4';
                this.writeStream = fs.createWriteStream(filename);
                this.readStream.stdout.pipe(this.writeStream);

                this.writeStream.on('finish', this.recordStreamProxy);

                setTimeout(function(){
                    self.writeStream.end();
                }, this.timeLimit*1000);

                this.log("Start record "+filename+"\r\n");
            });

            return this;
        };

        /**
         * Proxy for record stream method
         */
        this.recordStreamProxy = function(){
            self.recordStream();
        };

        /**
         * Clear movies directory
         * @param cb {function} callback
         */
        this.clearDir = function(cb){
            var called = false;

            function ok(){
                if(self.writeStream){
                    self.writeStream.end();
                    self.writeStream.removeListener('finish', self.recordStreamProxy);
                }
                self.writeStream = null;

                cb.apply(self);
            }

            du(this.folder, function (err, size) {
                if(size/1024/1024 > self.maxDirSize){
                    try{
                        removeFolder(self.folder, function(){
                            fs.mkdir(self.folder, function(){
                                if(!called){
                                    ok();
                                    called = true;
                                }
                            });
                        });
                    }catch (err){
                        self.log(err);
                    }
                }else{
                    if(!called){
                        ok();
                        called = true;
                    }
                }
            });

            return this;
        };

        /**
         * Start stream video to websocket
         * @param port {int} ws port
         * @param cb {function} callback
         */
        this.wsStream = function(port, cb){
            function start(){
                this.wsServer = new ws.Server({
                    port: port
                });

                this.wsServer.on("connection", function(socket) {
                    var streamHeader = new Buffer(8);
                    streamHeader.write(STREAM_MAGIC_BYTES);
                    streamHeader.writeUInt16BE(self.movieWidth, 4);
                    streamHeader.writeUInt16BE(self.movieHeight, 6);
                    socket.send(streamHeader, {binary:true});
                });

                this.wsServer.broadcast = function(data, opts) {
                    var i, _results;
                    _results = [];
                    for (i in this.clients) {
                        if (this.clients[i].readyState === 1) {
                            _results.push(this.clients[i].send(data, opts));
                        }
                    }
                    return _results;
                };

                this.on('camData', function(data){
                    return self.wsServer.broadcast(data);
                });

                self.log('Websocket stream started to port: '+port);

                if(cb) cb();
            }

            if(this.movieWidth){
                start.apply(this);
            }else{
                this.once('haveMovieSize', start);
            }

            return this;
        };

        /**
         * Initialize record
         * @see reconnect
         * @see recordStream
         */
        this.initialize = function(){
            this.on('readStart', function(){
                self.maxTryReconnect = 5;
                self.recordStream();
            });

            this.reconnect();

            return this;
        };
    };

    util.inherits(Recorder, events.EventEmitter);

    module.exports = Recorder;
})();