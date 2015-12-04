/**
 * Created by Shoom on 04.12.15.
 */

(function(){
    var child_process = require('child_process');

    /**
     * Farm of recorders
     * @param childFile {string} path to file with child process start
     * @param cameras {object} array of cameras configs
     * @constructor
     */
    var Farm = function(childFile, cameras){
        var self = this;
        this.collection = {};

        /**
         * Spawn child proccess with recorder
         * @param conf {object} recorder configuration
         * @param name {string} name of recorder
         * @param restart {boolean} is restart spawn
         */
        this.spawnChild = function(conf, name, restart){
            var old = this.collection[name];
            if(old){
                if(old.connected){
                    old.kill();
                    old.disconnect();
                }
                delete self.collection[name];
            }

            var child = child_process.spawn("node",
                [childFile, name, JSON.stringify(conf)],
                {detached: false}
            );

            child.stdout.on('data', function (data) {
                console.log(name+': ' + data);
            });

            child.stderr.on('data', function (data) {
                console.log(name+' ERROR: ' + data);
            });

            child.on('close', function (code) {
                console.log(name+' closed: ' + code);
                //Restart proccess when him close
                self.spawnChild(conf, name, 1);
            });

            if(restart){
                console.log(name+ ' REstarted!');
            }else{
                console.log(name+ ' started!');
            }

            self.collection[name] = child;
        };

        /**
         * Initialization
         */
        this.initialize = function(){
            //run
            for(var _name in cameras){
                if(cameras.hasOwnProperty(_name)){
                    this.spawnChild(cameras[_name], _name);
                }
            }
        };
    };

    module.exports = Farm;
})();