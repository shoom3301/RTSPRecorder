/**
 * Created by Shoom on 04.12.15.
 */

var Recorder = require('./../RTSPRecorder');

var conf = JSON.parse(process.argv[3]);

new Recorder(conf, process.argv[2]).initialize();