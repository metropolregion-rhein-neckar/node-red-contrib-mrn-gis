% The Ultimate Node-RED-GIS User Guide


%%TOC%%

# What is Node-RED?

Node-RED is a tool for *visual programming*. "Visual programming" means that you create programs essentially by drawing diagrams using a graphical user interface (GUI) similar to a drawing application, instead of writing code, as it is done in traditional programming. Node-RED was originally developed by IBM and released as Open Source in 2016. It is since further developed and used by a growing world-wide community.

Node-RED has several special characteristics and advantages that make it a great choice for many tasks:

- As already mentioned, Node-RED is *open source*. It is completely free to use, modify and extend for any use case.

- Node-RED is *web based*. This means that its data processing routines run on a remote server and its user interface runs in any modern web browser. No installation of additional software on a client computer is required to use Node-RED (apart from a web browser, which is usually already present on every computer). Also, by running compute-heavy processes on a server, a user's personal computer is not loaded with that work and can also be switched off while the data processing is done on the server. Last but not least, the server can be configured to run Node-RED tasks automatically in defined periods of time.

- Node-RED is light-weight. It is very easy to set up and has no big or exotic hard- or software requirements.

- Node-RED is written in JavaScript. It runs on every operating systems for which the Node.js JavaScript runtime environment is available. Furthermore, JavaScript makes it very easy to extend Node-RED with additional functionality. A large number of 3rd-party extensions is already available, and the process of creating new ones is not hard to learn for everybody who already knows JavaScript e.g. from web development.

## Node-RED Terminoloy and Basic Concepts

A visual program in Node-RED is called a *flow*. A flow consists of several functional building blocks called *nodes*. Nodes have input and output ports. The sequence of actions that make up a program is defined by connecting the output port of a node with the input port of another node, thus forming a chain of connected nodes. 

Each nodes represents an atomic function in the program that operates on packets of data which are sent to the node through its input port. These packets are called *messages*. The result of the operation is passed as another message through the Node's output port to the next node. Flows can branch (i.e. one output port connecting to multiple input ports/nodes) and merge (i.e. multiple output ports on different nodes connecting to a single input port/node).

Apart from incoming messages, another source of information on which a node operates is its configuration. Each node has an UI form through which parameters for the node can be set. These parameters are independent of the processed messages, and the result of a node's action is usually defined by a combination of input message data and configuration data.

# What is Node-RED-GIS?

Node-RED-GIS is an extension package for Node-RED that provides a set of nodes for geospatial data processing. 

## Development and Funding
The package is currently developed by *GeoNet.MRN e.V.* as part of the *xDataToGo* research project ("Experimentierfeld digitaler Straßenraum") funded by the *German Ministry of Transport and Digital Infrastructure* (*Bundesministerium für Verkehr und digitale Infrastruktur, BMVI*), in cooperation with the *department for digitalization and e-government of Metropolregion Rhein-Neckar GmbH*, where the package is used to prepare data for the *Metropolatlas Rhein-Neckar* project.

## Current Focus and Limitations
Due to its origins in the *xDataToGo* and *Metropolatlas Rhein-Neckar* projects, the current functional coverage of Node-RED-GIS is still heavly focused and limited to particular requirements of these projects. While our aim is to eventually provide a wide range of generic GIS functions, we are currently still far from reaching this goal. Generally, Node-RED-GIS is still in a very early stage of development. Please consider this when you use it.

Also keep in mind that at the current stage of development, we make frequent and sometimes massive changes, so this documentation could be outdated very quickly. We will try to keep it up to date, but this might not always work. If you find invalid information in this document, please let us know.

# Installing Node-RED

// TODO: Write

# Installing Node-RED-GIS

## 1. Cloning the repository
 
*git clone* the repository and *cd* into the cloned directory. This directory will from now on be referred to as the "package folder".

## 3. Install dependencies
 
Run *npm install* within the package folder. This downloads required libraries and build tools.

## 4. Build the project
 
Run *npm run build*. This compiles the TypeScript source files and puts the produced .js files + accompanying .html files into a folder "dist", which is newly created in your package folder.

## Install the library in your Node-RED environment

*cd* into the data directory of your Node-RED instance.

If you run Node-RED *with your personal user account*, the Node-RED data directory is */home/[your user name]/.node-red*.

If you run Node-RED *as root* (e.g. as a service which is automatically startet at system boot), the Node-RED data directory is */root/.node-red*.

To be able to enter */root* and its subfolders, you might first have to acquire root privileges, e.g. through *sudo su* on Ubuntu.

Within your Node-RED data directory, run *npm install [path to your package folder]*.

## (Re-)start your Node-RED instance

You are done. Now you should see this extension in the palette of your Node-RED instance and be able to activate it.




# Node-RED-GIS Overview and Concepts

The currently available set of nodes in Node-RED-GIS contains the following categories:

* GeoJSON processing
* OpenStreetMap (Overpass API) interface
* GeoServer interface 
* Miscellaneous other interfaces (air quality information services, road construction information services etc.)

Several general and important concepts apply to most nodes. These are explained in the following sections.

## GeoJSON as Common Exchange Format for Geospatial Data

Wherever possible, *GeoJSON* is used as the format to exchange geospatial data between nodes. There are exceptions where other formats need to be used due to special requirements.

## Use of Files to Exchange Data Between Nodes
Usually, any data larger than only a few bytes are not passed directly as content of messages between nodes. Instead, the sending node writes the data to a file and sends a message containing the location of that file to the next node. The next node reads the location from the message and loads the data from the file again. This approach goes to some degree against established concepts in the Node-RED world, but it has several advantages for our typical use cases.

## General Design Decisions

Designing workflows and suitable nodes for Node-RED is no simple task. One major challenge is to find a good middle ground between flexibility/generality and ease of use:

- The more *generic* and *atomic* a node is, the more different individual nodes are required to get a specific task done, and their configuration and interoperation might be more difficult to understand. 

- The more *specialized* and *integrated* (a lot of hard-wired functionality and behaviour) a node is, the easier its usage and the shorter and simpler a flow can be (assuming that it is otherwise well designed).

In this trade-off, we clearly lean towards the side of *more generalization and more atomic components* for the price of *somewhat more complicated use*. Especially in the current early stage of development, where UI and usage concepts are still far from polished, a certain level of understanding and willingness to familiarize oneself with the matter is required anyway in order to use our nodes. This would apply even if their design leaned more towards more integrated "all in one" solutions. While user-friendliness is important to us, we assume that users are willing and capable to understand why we designed specific things the way we did, and will eventually appreciate it.

Furthermore, it is possible in Node-RED to combine to create "subflows" that encapsulate the functionality of multiple nodes and their interactions into a single "virtual" node that can be used just like a normal node. This way, it is always possible to create more integrated higher-level nodes from basic low-level components, while the other direction (breaking highly integrated individual nodes into smaller pieces) is not possible.

// TODO: Temporary file path generation
// TODO: Global temporary directory

// TODO: Which advantages?
# Node Descriptions
## GeoJSON Nodes
The GeoJSON category contains nodes which generally perform some geospatial operation and use the GeoJSON format for input, output or both.

### GeoJSON Merge Node
The GeoJSON merge node merges multiple GeoJSON documents into one. The documents must exist as files on the file system and their path be passed to the GeoJSON merge node as the payloads of incoming messages. The GeoJSON merge node supports multiple input connections, each connection providing one document to merge. The node will wait until it has received a file path from each input connection, then merge them, write the result to disk as another file and pass the location to that file as a message to its successor nodes.

#### Configuration Parameters

- *Temp dir*: A reference to a global configuration node that specifies the temporary directory to which the output file is written if no output file path is explicitly provided by the user. Mandatory.

- *Output file path*: The location (path + name) where the output file should be written. Optional, will use temp dir + random file name if not specified.

- *Value for timeout in seconds*: How long the node waits for incoming messages from all connected input nodes. This is helpful if e.g. the upstream subflows contain actions like e.g. HTTP requests, which might take a long time or fail completely. After the timeout has passed, the GeoJSON merge node will merge the documents that have arrived up to this point, send the result, and then reset itself, waiting for incoming messages from all input connections again.

// TODO: 2 Is this correct?

### GeoJSON Properties Filter Node

This node expects a GeoJSON file as input. It removes from all of its features all properties which have a key that is not included in a whitelist specified by the user as part of the node's configuration. This is useful if e.g. you fetch features from OpenStreetMap, which can have a lot attributes you might not be interested in. The resulting GeoJSON document is written to a new file.

### GeoJSON Geometries to Centroids Node

This node expects a GeoJSON file as input. For each feature, it calculates the centroid of the feature's geometry (all GeoJSON geometry types are supported) and replaces the original geometry with that centroid point. The resulting GeoJSON document is written to a new file.

### GeoJSON to GeoPackage (GPKG) Converter Node

This node expects a GeoJSON file as input. It creates a GeoPackage (GPKG) file which contains the data from the GeoJSON file. Since GeoPackage does not support multiple geometry types in one layer, a separate layer is created for each geometry type that occurs in the input GeoJSON file. Features are added to the respective layer based on their geometry type. A typical use case for this node is to create GeoPackage files to publish on GeoServer, since GeoServer accepts only GeoPackage and Shapefile as upload formats, and GeoPackage is clearly the preferred solution.

### GeoJSON Values Filter

// TODO: Fill out by Julian?

### GeoJSON Spatial Within Filter

// TODO: Fill out by Julian?


## OpenStreetMap Nodes
Node-RED-GIS contains two nodes to retrieve and process *OpenStreetMap* data using the *OSM Overpass API*. The first node *downloads data from an Overpass endpoint* and writes the response in the original Overpass JSON format to a file. The second node converts such files to GeoJSON.

### OSM Overpass Download Node

This node fetches OpenStreetMap data from an Overpass API HTTP endpoint. The query parameters (geographic extent, key/value match requirements etc.) are specified by the user in the node's configuration. The API response, which is a JSON document with an Overpass-specific structure, is written to a file, and the path to this file is sent as the outgoing message.


### Defining Overpass queries

How to specify a logical AND:

`["highway"="primary"]["ref"="B 47"]`

How to specify a logical OR:

`["highway"="primary"],["ref"="B 47"]`


### Overpass download size limits


### OSM Overpass JSON to GeoJSON Converter Node

This node reads a JSON file in the Overpass query response format, as it is created by the OSM Overpass Download node, and converts it to GeoJSON. The result is written to a file, and the path to this file is sent as the outgoing message.


## GeoServer Nodes
### GeoServer GeoPackage Upload & Publish Node

### Maximum number of attributes in GeoPackage layers

## Air Quality Data Nodes
### luftdaten.info API Request
### luftdaten.info Data Aggregation
### OpenSense API Request
### Umweltbundesamt API Request

## Other Nodes
### verkehrsinfo-bw.de API request

## Global Configuration Node
