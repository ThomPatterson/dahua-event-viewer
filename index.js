const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

//to begin, assume the remote directory is mounted locally on this machine
let dvrWorkDir = '/Volumes/backyard-ptz';

//also assuming there is only one camera
let jpgDir = '/001/jpg';

//store jpg paths in multi dimension array, [date][hour][minute] = [paths]

//TODO
//using hours and minutes (str) as object keys results in sorting where 10, 20, 30, etc come before 00, 01.  Resorted to prefixing time with letter.

Handlebars.registerHelper('Hour', (hour) => {
  var hourInt = parseInt(hour.slice(1));
  let period = 'AM';
  if (hourInt > 12) {
    hourInt = hourInt - 12;
    period = 'PM';
  }
  let retStr = hourInt + ':00 ' + period;
  if (hourInt == 0) {
    retStr = 'Midnight'
  }
  return retStr
});

Handlebars.registerHelper('ImageCount', (hourData) => {
  let count = 0;
  for (minute in hourData) {
    count += hourData[minute].length;
  }
  return count;
});

Handlebars.registerHelper('Timestamp', (filePath) => {
  let timeParts = /([\d]{2})\/([\d]{2})\/([\d]{2})([^/]+)\.jpg/.exec(filePath);
  let hour = timeParts[1];
  let min = timeParts[2];
  let sec = timeParts[3];
  return hour + ':' + min + ':' + sec;
});

function getAvailableDates() {
	let data = {};
	return new Promise((resolve, reject) => {
		fs.readdir(dvrWorkDir, (err, fileNames) => {

			if (err) reject('Unable to read directory ' + dvrWorkDir + '  ' + err);

			let datePattern = /[\d]{4}-[\d]{2}-[\d]{2}/

			fileNames.forEach(fileName => {
				if (datePattern.test(fileName)) {
					data[fileName] = {};
				}
			});

			resolve(data);
		})
	});
}

function getAvailableHours(data) {
	return new Promise((resolve, reject) => {
		let promises = [];
		for (date in data) {
			let dateDir = path.join(dvrWorkDir, date, jpgDir);

			promises.push(new Promise((res, rej) => {
				let keyDate = date;
				fs.readdir(dateDir, (err, fileNames) => {

					if (err) rej('Unable to read directory ' + dateDir + '  ' + err);

					fileNames.forEach(fileName => {
						data[keyDate]['h' + fileName] = {}
					});

					res();

				});
			}));
		}

		Promise.all(promises).then(() => {
			return resolve(data);
		}).catch(err => {
			return reject(err);
		});
	});
}

function getAvailableMinutes(data) {
	return new Promise((resolve, reject) => {
		let promises = [];
		for (date in data) {
			for (hour in data[date]) {
				let dir = path.join(dvrWorkDir, date, jpgDir, hour.slice(1));

				promises.push(new Promise((res, rej) => {
					let keyDate = date;
					let keyHour = hour;

					fs.readdir(dir, (err, fileNames) => {

						if (err) rej('Unable to read directory ' + dir + '  ' + err);

						fileNames.forEach(fileName => {
							data[keyDate][keyHour]['m' + fileName] = [];
						});

						res();
					});

				}));
			}
		}

		Promise.all(promises).then(() => {
			return resolve(data);
		}).catch(err => {
			return reject(err);
		});
	});
}

function getAvailableSnapshots(data) {
	return new Promise((resolve, reject) => {
		let promises = [];
		for (date in data) {
			for (hour in data[date]) {
				for (minute in data[date][hour]) {
					let dir = path.join(dvrWorkDir, date, jpgDir, hour.slice(1), minute.slice(1));

					promises.push(new Promise((res, rej) => {
						let keyDate = date;
						let keyHour = hour;
						let keyMin = minute;

						fs.readdir(dir, (err, fileNames) => {

							if (err) rej('Unable to read directory ' + dir + '  ' + err);

							fileNames.forEach(fileName => {
								data[keyDate][keyHour][keyMin].push(path.join(dir, fileName));
							});

							res();
						});

					}));
				}
			}
		}

		Promise.all(promises).then(() => {
			return resolve(data);
		}).catch(err => {
			return reject(err);
		});
	});
}

function getTemplate() {
	return new Promise((resolve, reject) => {
		fs.readFile('./gallery.hbs', (err, data) => {
			if (err) return reject(err);
			resolve(data.toString());
		})
	});
}

function writeHtml(html) {
	fs.writeFile('output/gallery.html', html, function(err) {
		if (err) {
			return console.error(err);
		}

		console.log("The file was saved!");
	});
}

function filterDates(data, days) {
  let filteredDates = {};
  let now = new Date();
  let timeLimit = days*24*60*60*1000;
  for (date in data) {
    let datePattern = /([\d]{4})-([\d]{2})-([\d]{2})/
    let dateParts = datePattern.exec(date);
    let fileDate = new Date(dateParts[1], dateParts[2]-1, dateParts[3]);
    if ((now - fileDate) < timeLimit) {
      filteredDates[date] = data[date];
    }
  }
  return filteredDates;
}

let galleryTemplate;
getTemplate()
	.then(templateSrc => {
		galleryTemplate = Handlebars.compile(templateSrc);
		return getAvailableDates();
	})
	.then(data => {
    let filteredDates = filterDates(data, 1);
		return getAvailableHours(filteredDates);
	})
	.then(data => {
		return getAvailableMinutes(data);
	})
	.then(data => {
		return getAvailableSnapshots(data);
	}).then(data => {
		let html = galleryTemplate({
			date: data
		});
		writeHtml(html);
	}).catch(err => {
		console.error(err);
	});