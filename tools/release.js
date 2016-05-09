process.env.NODE_ENV = 'production';

var st = new Date().getTime();

var fs = require('fs-promise');
var path = require('path');
var colors = require('colors/safe');
var cpp_exec = require('child-process-promise').exec;

var exec = function(cmd){
	return cpp_exec(cmd).then(function (result) {
		var stdout = result.stdout;
		var stderr = result.stderr;
		console.log(stdout);
		stderr && console.log('stderr: ', stderr);
	}).fail(function (err) {
		console.error('ERROR: ', err);
	});
};

var basePath = path.resolve(__dirname, '..') + '/';
var pkgconf = require(basePath + 'package.json');


var error = colors.red;
var argv = Array.prototype.concat.apply([], process.argv);
var outputPath = basePath + 'output/';
var pkgPath = basePath + 'pkg/';
var static = 'resource';
var releaseType = argv[2] || 'update';

var modules = [];
for(var module in pkgconf.dependencies) {
	modules.push(module);
}

if (releaseType == 'all') {
	for(var module in pkgconf.devDependencies) {
		modules.push(module);
	}
}


Promise.resolve().then(function(){
	/*package.json*/
	// 避免同步删除
	return fs.exists(outputPath).then(function(exists){
		return exists && fs.remove(outputPath);
	}).then(function(){
		return fs.mkdir(outputPath);
	}).then(function(){
		return fs.copy(basePath + 'package.json', outputPath + 'package.json');
	});
}).then(function(){
	/*node_modules*/
	if (releaseType != 'local' && releaseType != 'update') {
		console.log('begin release with node_modules');

		return Promise.resolve().then(function(){
			// 依赖
			if (releaseType == 'online' || releaseType == 'i') {
				console.log('\t npm install!');

				var cmd = 'cd ' +outputPath+ ' && npm install --registry=https://registry.npm.taobao.org';
				if (true || releaseType == 'online') {
					cmd += ' --production';
				}

				return exec(cmd);
			} else if (releaseType == 'all' || releaseType == 'c' ) {
				console.log('\t copy!');

				var modulesPath = basePath + 'node_modules';
				return fs.exists(modulesPath).then(function(exists){
					if (exists) {
						if (releaseType == 'all') {
							return fs.copy(modulesPath, outputPath + '/node_modules');
						} else {

							var modulesCpP = modules.map(function(module){
								var mp = basePath + 'node_modules/' + module;
								return fs.exists(mp).then(function(exists){
									return exists && fs.mkdirs(outputPath + mp).then(function(){
										fs.copy(mp, outputPath + mp);
									});
								});
							});
							return Promise.all(modulesCpP);
						}
					} else {
						console.log(colors.yellow('maybe you want copy node_modules, but node_modules is not exist.'));
					}
				});

			}
		})
	} else {
		fs.symlinkSync(basePath + 'node_modules', outputPath + 'node_modules', 'dir');
	}
}).then(function(){
	return Promise.all([
		fs.copy(basePath + 'app', outputPath + 'app'),
		fs.copy(basePath + 'view', outputPath + 'view'),
		fs.copy(basePath + 'www', outputPath + 'www'),
		fs.copy(basePath + 'sqlite', outputPath + 'sqlite'),
		fs.copy(basePath + 'pm2.json', outputPath + 'pm2.json')
	]);
}).then(function(){
	var op = path.resolve(outputPath);

	if (!fs.existsSync(pkgPath)) {
		fs.mkdirSync(pkgPath);
	}

	/*npm打包*/
	if (releaseType == 'update') {
		console.log('begin tar');
		return fs.remove(outputPath + 'node_modules').then(function(){
			exec('gulp updatetar');
		});
	} else if (releaseType != 'local') {
		console.log('begin tar|pack with node_modules');

		return Promise.resolve().then(function(){
			pkgconf.bundleDependencies = modules;
			fs.outputJSONSync(outputPath + 'package.json', pkgconf);
			delete pkgconf.bundleDependencies;

			// 打包
			if (releaseType == 'online' || releaseType == 'c') {
				console.log('\t tar!');
				return exec('gulp installtar');
			} else {
				console.log('\t pack!');

				return exec('cd ' +pkgPath+ ' && npm pack ' + op);

			}
		});
	}
}).then(function(){
	console.log('\nrelease success!');
	console.log(colors.green('time: ' + (new Date().getTime() - st)));
	if (releaseType != 'local') {
		return fs.exists(outputPath).then(function(exists){
			return exists && fs.remove(outputPath)
		});
	}
}).catch(function(err){
	console.error(error('[error] release fail. maybe need sudo!\n' + err.message));
});
