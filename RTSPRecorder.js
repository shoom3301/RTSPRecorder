/**
 * Created by Shoom on 02.12.15.
 */

(function(){
    var
        fs = require('fs'),
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

    var protocol = 'rtsp://';
    var urlRegex =  new RegExp(protocol+"([\\w\\d]+):([\\w\\d]+)@");

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
        //max size of video directory (MB), if size more than this size dir will be cleared
        this.maxDirSize = 100;
        //limit to record one video file (sec)
        this.timeLimit = 600;
        //folder of videos
        this.folder = '/';

        params = params || {};
        for(var v in params){
            if(params.hasOwnProperty(v)) this[v] = params[v];
        }

        if(!this.username){
            var regres = urlRegex.exec(this.url);
            this.url.replace(regres[0], '');
            this.username = regres[1];
            this.password = regres[2];
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
         * Path to records folder
         * @returns {string}
         */
        this.recordsPath = function(){
            return this.folder+(this.name?(this.name+'/'):'');
        };

        this.ffmpeg = function(filename){
            return child_process.spawn("ffmpeg",
                ["-i", protocol+this.username+':'+this.password+'@'+this.url, '-an', '-f', 'mpeg1video', '-b:v', '128k', '-r', '25', filename],
                {detached: false}
            );
        };

        this.openRTSP = function(filename){
            return child_process.spawn("openRTSP",
                ["-u", this.username, this.password, '-f', '25', protocol+this.url],
                {detached: false, stdio: ['ignore', fs.openSync(filename, 'w'), 'ignore']}
            );
        };

        /**
         * Record stream to file
         */
        this.recordStream = function(){
            if(this.timer) clearTimeout(this.timer);

            if(this.writeStream && this.writeStream.binded) return false;

            if(this.writeStream && this.writeStream.connected){
                this.writeStream.binded = true;

                this.writeStream.once('exit', function(){
                    self.recordStream();
                });

                this.writeStream.kill();

                return false;
            }

            this.clearDir(function(){
                var filename = this.recordsPath()+dateString()+'.mp4';

                this.writeStream = null;
                this.writeStream = this.openRTSP(filename);

                this.writeStream.once('exit', function(){
                    self.recordStream();
                });

                this.timer = setTimeout(function(){
                    self.writeStream.kill();
                }, this.timeLimit*1000);

                this.log("Start record "+filename);
            });

            return this;
        };

        /**
         * Clear movies directory
         * @param cb {function} callback
         */
        this.clearDir = function(cb){
            var called = false;

            function ok(){
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
            if(!this.url){
                return this.log('URL os required.');
            }
            //Create records directory if not exist
            try{
                if(!fs.lstatSync(this.recordsPath()).isDirectory()){
                    fs.mkdirSync(this.recordsPath());
                }
            }catch (e){
                fs.mkdirSync(this.recordsPath());
            }

            self.recordStream();

            return this;
        };
    };

    module.exports = Recorder;
})();