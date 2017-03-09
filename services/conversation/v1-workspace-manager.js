/**
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  const SERVICE_IDENTIFIER = 'conversation';
  var temp = require('temp'),
    fs = require('fs'),
    serviceutils = require('../../utilities/service-utils'),
    payloadutils = require('../../utilities/payload-utils'),
    ConversationV1 = require('watson-developer-cloud/conversation/v1'),
    service = serviceutils.getServiceCreds(SERVICE_IDENTIFIER),
    username = '', password = '', sUsername = '', sPassword = '';

  temp.track();

  // Require the Cloud Foundry Module to pull credentials from bound service
  // If they are found then the username and password will be stored in
  // the variables sUsername and sPassword.
  //
  // This separation between sUsername and username is to allow
  // the end user to modify the credentials when the service is not bound.
  // Otherwise, once set credentials are never reset, resulting in a frustrated
  // user who, when he errenously enters bad credentials, can't figure out why
  // the edited ones are not being taken.

  if (service) {
    sUsername = service.username;
    sPassword = service.password;
  }

  function executeListWorkspaces(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.listWorkspaces(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          msg['workspaces'] = response.workspaces ?
                                        response.workspaces: response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeGetWorkspace(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.getWorkspace(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          msg['workspace'] = response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeCreateWorkspace(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.createWorkspace(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          msg['workspace'] = response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeUpdateWorkspace(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.updateWorkspace(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          msg['workspace'] = response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeDeleteWorkspace(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.deleteWorkspace(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          msg['workspace'] = response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeListIntents(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.getIntents(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          msg['intents'] = response.intents ?
                                        response.intents: response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeGetIntent(node, conv, params, msg) {
    var p = new Promise(function resolver(resolve, reject){
      conv.getIntent(params, function (err, response) {
        if (err) {
          reject(err);
        } else {
          // returning the whole response as response.intent has
          // the intent, but the details with export = true
          // are provided as response.examples
          msg['intent'] = response;
          resolve();
        }
      });
    });
    return p;
  }

  function executeUnknownMethod(node, conv, params, msg) {
    return Promise.reject('Unable to process as unknown mode has been specified');
  }

  function executeMethod(node, method, params, msg) {
    var conv = new ConversationV1({
      username: username,
      password: password,
      version_date: '2017-02-03'
    });

    node.status({fill:'blue', shape:'dot', text:'executing'});

    var p = null;

    switch (method) {
    case 'listWorkspaces':
      p = executeListWorkspaces(node, conv, params, msg);
      break;
    case 'getWorkspace':
      p = executeGetWorkspace(node, conv, params, msg);
      break;
    case 'createWorkspace':
      p = executeCreateWorkspace(node, conv, params, msg);
      break;
    case 'updateWorkspace':
      p = executeUpdateWorkspace(node, conv, params, msg);
      break;
    case 'deleteWorkspace':
      p = executeDeleteWorkspace(node, conv, params, msg);
      break;
    case 'listIntents':
      p = executeListIntents(node, conv, params, msg);
      break;
    case 'getIntent':
      p = executeGetIntent(node, conv, params, msg);
      break;
    default:
      p = executeUnknownMethod(node, conv, params, msg);
      break;
    }

    return p;
  }

  // Copy over the appropriate parameters for the required
  // method from the node configuration
  function buildParams(msg, method, config, params) {
    var message = '';
    switch (method) {
    case 'getIntent':
      if (config['cwm-intent']) {
        params['intent'] = config['cwm-intent'];
      } else {
        message = 'a value for Intent is required';
      }
      // Deliberate no break as also want workspace ID
      // and export setting.
    case 'listIntents':
      params['export'] = config['cwm-export-content'];
      // Deliberate no break as want workspace ID also;
    case 'updateWorkspace':
    case 'deleteWorkspace':
      if (config['cwm-workspace-id']) {
        params['workspace_id'] = config['cwm-workspace-id'];
      } else {
        message = 'Workspace ID is required';
      }
      break;
    }
    if (message) {
      return Promise.reject(message);
    }
    return Promise.resolve();
  }

  // No need to have complicated processing here Looking
  // for individual fields in the json object, like name,
  // language, entities etc. as these are the parameters
  // required for this method are in the json object, at
  // the top level of the json object. So it is safe
  // to overwrite params.
  //  'name', 'language', 'entities', 'intents',
  // 'dialog_nodes', 'metadata', 'description',
  // 'counterexamples'
  // Just need to add the workspace id back in
  function setWorkspaceParams(method, params, workspaceObject) {
    var workspace_id = null;
    if ('updateWorkspace' === method && params['workspace_id']) {
      workspace_id = params['workspace_id'];
    }
    if ('object' !== typeof workspaceObject) {
      return Promise.reject('json content expected as workspace');
    }
    if (workspaceObject) {
      params = workspaceObject;
    }
    if (workspace_id) {
      params['workspace_id'] = workspace_id;
    }
    return Promise.resolve(params);
  }


  function openTheFile() {
    var p = new Promise(function resolver(resolve, reject){
      temp.open({
        suffix: '.txt'
      }, function(err, info) {
        if (err) {
          reject('Error receiving the data buffer');
        } else {
          resolve(info);
        }
      });
    });
    return p;
  }

  function syncTheFile(info, msg) {
    var p = new Promise(function resolver(resolve, reject){
      fs.writeFile(info.path, msg.payload, function(err) {
        if (err) {
          reject('Error processing data buffer');
        }
        resolve();
      });
    });
    return p;
  }

  function processFileForWorkspace(info, method) {
    var workspaceObject = null;

    switch (method) {
    case 'createWorkspace':
    case 'updateWorkspace':
      try {
        workspaceObject = JSON.parse(fs.readFileSync(info.path, 'utf8'));
      } catch (err) {
        workspaceObject = fs.createReadStream(info.path);
      }
    }

    return Promise.resolve(workspaceObject);
  }


  // We are expecting a file on payload.
  // Some of the functions used here are async, so this
  // function is returning a consolidated promise,
  // compromising of all the promises from the async and
  // sync functions.
  function loadFile(node, method, params, msg) {
    var fileInfo = null;
    var p = openTheFile()
      .then(function(info){
        fileInfo = info;
        return syncTheFile(fileInfo, msg);
      })
      .then(function(){
        return processFileForWorkspace(fileInfo, method);
      })
      .then(function(workspaceObject){
        return setWorkspaceParams(method, params, workspaceObject);
      });

    return p;
  }


  // For certain methods a file input is expected on the payload
  function checkForFile(method) {
    switch (method) {
    case 'createWorkspace':
    case 'updateWorkspace':
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  function initialCheck(u, p, m) {
    var message = '';
    if (!u || !p) {
      message = 'Missing Conversation service credentials';
    } else if (!m || '' === m) {
      message = 'Required mode has not been specified';
    }
    if (message){
      return Promise.reject(message);
    }
    return Promise.resolve();
  }


  // These are APIs that the node has created to allow it to dynamically fetch Bluemix
  // credentials, and also translation models. This allows the node to keep up to
  // date with new tranlations, without the need for a code update of this node.

  // Node RED Admin - fetch and set vcap services
  RED.httpAdmin.get('/watson-conversation-v1-workspace-manager/vcap', function (req, res) {
    res.json(service ? {bound_service: true} : null);
  });


  // This is the Speech to Text V1 Query Builder Node
  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      var method = config['cwm-custom-mode'],
        message = '',
        params = {};

      username = sUsername || this.credentials.username;
      password = sPassword || this.credentials.password || config.password;

      node.status({});
      initialCheck(username, password, method)
        .then(function(){
          return buildParams(msg, method, config, params);
        })
        .then(function(){
          return checkForFile(method)
        })
        .then(function(fileNeeded){
          if (fileNeeded) {
            if (msg.payload instanceof Buffer) {
              return loadFile(node, method, params, msg);
            }
            // If the data is a json object then it will not
            // have been detected as a buffer.
            return setWorkspaceParams(method, params, msg.payload);
          }
          return Promise.resolve(params);
        })
        .then(function(p){
          params = p;
          node.status({fill:'blue', shape:'dot', text:'executing'});
          return executeMethod(node, method, params, msg);
        })
        .then(function(){
          node.status({});
          node.send(msg);
        })
        .catch(function(err){
          payloadutils.reportError(node,msg,err);
        });

    });
  }

  RED.nodes.registerType('watson-conversation-v1-workspace-manager', Node, {
    credentials: {
      username: {type:'text'},
      password: {type:'password'}
    }
  });

};
