# emvscode-web (Under development)
* VSCode for the Web Extension for Mizar

## Note
* This extension only works on the web.
* Mizar Server must be running for the extension to function properly.

## Demo
### Command execution
![demo](https://user-images.githubusercontent.com/32231297/92366947-c68bdb00-f130-11ea-8dd0-52ef3641e9cb.gif)

### Syntax highlight & Auto indent
![auto_indent](https://user-images.githubusercontent.com/32231297/93070316-af616600-f6b9-11ea-85b5-3deb887da308.gif)

### Hover information
![demo2](https://user-images.githubusercontent.com/32231297/92366998-d6a3ba80-f130-11ea-9f76-8117f82a03ea.gif)
## Features
* Mizar commands
    * Mizar Compile
    * Irrelevant Theorems
    * Irrelevant Iterative Steps
    * Irrelevant Inferences
    * Irrelevant Premises
    * Inaccessible Items
    * Trivial Proofs
    * Irrelevant Vocabularie
    * Irrelevant Label
* Syntax highlight
* Auto indent
* Hover information
* Go to definition
* Formatter
* Linter

## Installation
1. Open VSCode for the Web and type "Ctrl+Shift+X".  
2. Type "mizar" in the search box and click to install.

## Usage
1. Fork [mizar-server-contents](https://github.com/mimosa-project/mizar-server-contents)
2. Start VSCode for the Web in the forked repository
3. Input the "Mizar.OAuthToken" field in the extension settings
#### Command Execution
* Type "Ctrl+Shift+P" (or click title bar icon) and choose a command.

## Development
* Clone this repositry
    ```
    git clone https://github.com/mimosa-project/emvscode-web
    ```
* Change the current directory to emvscode directory
    ```
    cd emvscode-web
    ```
* Run "npm install"
    ```
    npm install
    ```
* reference
    * https://code.visualstudio.com/api/get-started/your-first-extension

## Author
* Ryutaro Matsumoto

## License
This project is licensed under the MIT License - see the LICENSE file for details.  
