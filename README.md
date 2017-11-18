### Releases
You can grab the latest release [here](https://github.com/licoffe/POE-sniper/releases).

__Note for Linux users__: Make sure to install the [_xclip_](https://linux.die.net/man/1/xclip) clipboard manager to be able to copy whisper messages to the clipboard.

![alt text](./sniper.png "Tool preview")

### Introduction
This tool lets you run live searches by parsing the latest item data from the Path of Exile API. The main benefit of this tool compared to poe.trade live search is the ability to centralize and save searches within a single window.

### Video
[Here](https://youtu.be/-R8lXIVEd-k) is a short 5 min video showcasing some of the features of the tool :)

### Features
Here is the set of features currently supported:

- Find underpriced items for each leagues
- Create item filters based on various criteria:
    - type
    - Armor/Shield/Evasion values
    - Affixes
    - Number of links
    - Sockets (total and R/G/B/W)
    - Item level
    - Item tier
    - Gem XP%
    - Quality
    - Corrupted/crafted/enchanted/identified
    - Rarity (including non-unique)
    - DPS (Total, Phys)
    - League
    - Price
- Import your poe.trade searches
- Show price stats of similar items appearing on poe.trade
- Search on poe.trade using your filter criteria
- Links to poe.trade, poe-rates.com search as well as the official wiki
- Notification support (both visual and sound)
- Contact sellers by clicking on an item entry or toggle automatic copy to the clipboard.
- Item price recommendation based on poe.trade
- Blacklist support (see [video](https://www.youtube.com/watch?v=ubZFsvfDSmE))
- Filter categories (see [video](https://www.youtube.com/watch?v=dPCcINACwrU))
- Mod group support (NOT, IF, SUM, COUNT, WEIGHT, AND)

### Technologies
The app is written in [Node.js](https://nodejs.org/en/) and packaged as a native application using the [Electron](https://electron.atom.io/) framework.

### How it works 
The tool starts by fetching the last change_id using the [http://poe-rates.com](poe-rates) API. Chunks are then downloaded from the Path of Exile API with gzip compression into memory. Each item in the chunk is compared to the filters created by the user and, should it match the criteria, displayed in the tool.

### How fast is it?
It depends on your connection speed.

### Is it faster than poe.trade?
It is [slightly faster](https://www.youtube.com/watch?v=LvW7x6OCEJU) for me, but that may not be the case for everyone.

### Running the tool
There are two ways to run the tool, either from the sources directly or by fetching one of the releases.
#### From source
Within a terminal:
- Clone the code using `git clone https://github.com/licoffe/POE-sniper.git`
- Change to the cloned location and run `npm install` to install all dependencies
- Finally, run `npm start` to start the indexer

### Disclaimer
Make sure to have an unlimited connection plan and a good bandwidth since the tool downloads currently around 1.5 MB of JSON data every second.

### Troubleshooting

#### Error on startup
![alt text](https://user-images.githubusercontent.com/9851687/29394111-e6815842-82cd-11e7-8155-78f21215e25b.png "JS error on startup")

If you run into this error on startup, it means that the config.json file holding your settings has been corrupted. The solution is to erase the config file, which will be rebuilt by the program on the next startup. Here are the different paths depending on your system:

- On Windows: C:\Users\YourUser\AppData\Roaming\POE-Sniper
- On MacOS: ~/Library/Application Support/POE-Sniper
- On Linux: ~/.config/POE-Sniper

#### Stuck on a change_id / No new items in a while
The connection to the API is set to timeout after a minute. If it happens for some reason (loss of internet connection, realm restart, computer went to sleep, etc.), the program will fetch again the last known change_id from either poe.ninja/poe-rates.com and attempt to download it.

If you did not receive item updates in a while, then this is most likely an error due to your current filter setup. Feel free to contact me on Reddit or Discord if it happens.

#### Program freeze
Make sure not to use filters which are too broad (ie. (any Gem) or (any Map)). A filter matching too many items is not useful, will greatly increase parsing time, consume additional memory and slow down the entire program.

### Contact

You can contact me on reddit or Discord, same account.