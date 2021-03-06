const fs = require('fs');
const got = require('got');
const path = require('path');
const url = require('url');
const mkdirp = require('mkdirp');
const config = require('./config');
const arrayUniq = array => [...new Set(array)];

const urlResolve = (...args)=> {
    return path.join.apply(null, [__dirname].concat(...args))
}

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
const basename = path.basename(__filename);
const distRoot = path.join(__dirname, config.directory);

const plugins = {};

fs
  .readdirSync(urlResolve('plugins'))
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js') && config.plugins.includes(file.slice(0, -3));
  })
  .forEach(file => {
    const plugin = require(urlResolve('plugins', file));
    plugins[file] = plugin;
  });


const getEncode = config.getEncode;

const parseChild = (body, realUrl, urls)=> {
    let finds = [];
    if ( config.bodyReplace ) {
        let object = config.bodyReplace
        for (const key in object) {
            if (object.hasOwnProperty(key)) {
                const element = object[key];
                if(body && body.replace) {
                    // utf-8 only string
                    body = body.replace(element, key);
                }
            }
        }
    }
    if(config.allowParseUrl(realUrl)) {
        config.sources.map((item)=> {
            let u = item.callback(body);
            if(u) {
                finds = finds.concat(u) 
            }
        })
        for (const plugin in plugins) {
            let u = plugins[plugin](body);
            if(u) {
                finds = finds.concat(u) 
            }
        }
    }

    if(finds.length) {
        // fix urls
        finds = finds.map(item => {
            // ../ ./
            if(item.startsWith('.')) {
                return url.resolve(realUrl, item)
            }
            if(item.startsWith('/')) {
                let pu = url.resolve(realUrl, config.root + item)
                return pu
            }
            if(/^[a-zA-Z0-9_-]/.test(item)) {
                return url.resolve(realUrl, item)
            }
            return item
        })
    }
    urls = finds.concat(urls);
    return arrayUniq(urls)
}

let writed = [];

const startCrawler = async function (urls) {
    if (urls && urls.length > 0) {
        const curl = urls.shift();
        let realUrl = url.resolve(config.start, curl);
        if(!writed.includes(realUrl)) {
            if(config.allowthirdDomain || realUrl.startsWith(config.base)) {
                let savePath = realUrl.replace(config.base, '');
                let dirname = path.dirname(savePath);
                let cdir = path.join(distRoot, dirname);
                let body = ''
                try {
                    const response = await got(realUrl, { encoding: getEncode(realUrl)});
                    body = response.body;
                    if(getEncode(realUrl) == 'base64') {
                        body = Buffer.from(body, 'base64');
                    }
                } catch (error) {
                    console.log('Not Found: '+  realUrl);
                    //=> 'Internal server error ...'
                } finally {
                    if(body) {
                        mkdirp(cdir, function (err) {
                            if (err) console.error(err)
                            else {
                                fs.writeFileSync(path.join(distRoot, savePath), body);
                                writed.push(realUrl);
                                urls = parseChild(body, realUrl, urls);
                                startCrawler(urls);
                            }
                        });
                    } else {
                        startCrawler(urls);
                    }
                }
            } else {
                startCrawler(urls);
            }
        } else {
            startCrawler(urls);
        }
    } else {
        try {
            if (config.captureSceenshot) {
                const captureWebsite = require('capture-website');
                await captureWebsite.file(config.base, path.join(distRoot, 'screenshot.png'),  {
                    userAgent: config.userAgent
                });
            }
            fs.writeFileSync(path.join(distRoot, 'writedlog.log'), writed.join('\n'));
        } catch (error) {
            console.log('Can not find anything.')
        }
        
    }
}


startCrawler(config.urls)









