let nodemon = require("nodemon");
let fs = require("fs");
let path = require("path");
let { exec } = require("child_process");
let __SAMFOLDER = path.join(".aws-sam", "build");
let chalk = require("chalk");

const yaml = require("js-yaml");
const TEMPLATE_YAML_PATH = "template.yaml";

/**
 * Parse template.yaml file.
 * @returns {map} code url: resoures name
 */
function parseTemplateYaml() {
  const fileStr = fs.readFileSync(TEMPLATE_YAML_PATH, { encoding: "utf-8" });
  let yamlData = yaml.load(fileStr.split("Outputs:")[0]);

  const resources = yamlData.Resources;
  const resourceNames = Object.keys(resources);

  const map = new Map();
  resourceNames.forEach((resourceName) => {
    let codeUri = resources[resourceName].Properties.CodeUri;
    if (codeUri.endsWith("/")) {
      codeUri = codeUri.substring(0, codeUri.length - 1);
    }
    map.set(codeUri, resourceName);
  });
  // console.log(map);

  return map;
}

/**
 * Get sSamFile path.
 * @param {map} resMap code url: resoures name
 * @param {string} sFile sFile path
 * @returns {string} sSamFile path
 */
function getSSamFilePath(resMap, sFile) {
  let relPath = path.relative(process.cwd(), sFile);
  let relPaths = relPath.split(path.sep);

  if (resMap.has(relPaths[0])) {
    relPaths[0] = resMap.get(relPaths[0]);
    relPath = path.join(...relPaths);
  } else {
    return;
  }

  return path.join(process.cwd(), __SAMFOLDER, relPath);
}

var bNotify = false;

function samwatch(args) {
  const resMap = parseTemplateYaml();
  
  // N / Notify command would just notify the error

  if (args.length > 2) {
    if (
      args[2].toUpperCase().indexOf("N") > -1 ||
      args[2].toUpperCase().indexOf("NOTIFY") > -1
    ) {
      bNotify = true;
    }
  }

  nodemon({
    script: path.join(__dirname, "dummy.js"),
    ext: "py js json",
  });

  nodemon
    .on("start", function () {
      console.log("Monitoring started \n");
    })
    .on("quit", function () {
      console.log("Monitoring started has quit \n");

      process.exit();
    })
    .on("restart", function (files) {
      files.forEach((sFile) => {
        try {
          const sSamFile = getSSamFilePath(resMap, sFile);
          // var sSamFile = path.join(process.cwd(), __SAMFOLDER, path.relative(process.cwd(), sFile));

          if (fs.existsSync(sSamFile)) {
            fs.copyFile(sFile, sSamFile, (err) => {
              if (err) throw err;
            });

            console.log(chalk.green(`: File copy completed \n`));
          } else {
            throw `File: ${sSamFile} does not exist in sam-build directory`;
          }
        } catch (err) {
          if (bNotify) {
            console.error(chalk.red(` Error notification: ${err}  \n`));
            console.log("Monitoring started \n");
          } else {
            console.error(
              chalk.blue(
                ` Error found in script execution, running fallback action, error:  ${err}  \n`
              )
            );

            console.log(" Running sam build, please wait...");
            exec("sam build", (error, stdout, stderr) => {
              if (error) {
                console.log(`error: ${error.message}`);
                return;
              }
              if (stderr) {
                console.log(`${stderr}`);

                console.log("Monitoring started \n");

                return;
              }

              if (stdout) {
                console.log(`stdout: ${stdout}`);
                console.log("Monitoring started \n");
                return;
              }
            });
          }
        }
      });
    });
}

module.exports = samwatch;
