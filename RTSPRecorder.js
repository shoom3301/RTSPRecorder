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
        async = require('async');

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
     * @param name {string} name if recorder
     * @constructor
     */
    var Recorder = function(params, name){
        this.name = name || '';
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
        //limit to record one video file (sec)
        this.timeLimit = 60*10;

        params = params || {};
        for(var v in params){
            if(params.hasOwnProperty(v)) this[v] = params[v];
        }

        this._maxTryReconnect = this.maxTryReconnect+0;

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
            if(this.readStream){
                if(this.readStream.connected){
                    this.readStream.kill();
                    this.readStream.disconnect();
                }
                this.readStream = null;
            }

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
            setTimeout(function(){
                if(self.maxTryReconnect > 0){
                    self.log('Try connect to '+self.url);
                    self.maxTryReconnect --;
                    try{
                        self.connect();
                    }catch(e){

                    }
                }else{
                    self.emit('lostConnection');
                    self.log('Connection lost \r\n');

                    process.exit(1);
                }
            }, 1000);

            return this;
        };

        /**
         * Path to records folder
         * @returns {string}
         */
        this.recordsPath = function(){
            return this.folder+(this.name?(this.name+'/'):'');
        };

        /**
         * Record stream to file
         */
        this.recordStream = function(){
            this.clearDir(function(){
                var filename = this.recordsPath()+this.prefix+dateString()+'.mp4';
                this.writeStream = fs.createWriteStream(filename);
                this.readStream.stdout.pipe(this.writeStream);

                this.writeStream.on('finish', this.recordStreamProxy);

                setTimeout(function(){
                    self.writeStream.end();
                }, this.timeLimit*1000);

                this.log("Start record "+filename);
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
         * Initialize record
         * @see reconnect
         * @see recordStream
         */
        this.initialize = function(){
            //Create records directory if not exist
            try{
                if(!fs.lstatSync(this.recordsPath()).isDirectory()){
                    fs.mkdirSync(this.recordsPath());
                }
            }catch (e){
                fs.mkdirSync(this.recordsPath());
            }

            this.on('readStart', function(){
                self.maxTryReconnect = self._maxTryReconnect;
                self.recordStream();
            });

            this.reconnect();

            return this;
        };
    };

    util.inherits(Recorder, events.EventEmitter);
    module.exports = Recorder;
})();