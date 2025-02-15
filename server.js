const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const port = 4000;

app.get('/', (req, res) => {
    res.send("Working!!!!")
});

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
);

const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
});

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file']
    });
    res.redirect(url);
}
);

app.get('/google/redirect', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync("creds.json", JSON.stringify(tokens));
        res.send('Authentication successful!');
    } catch (error) {
        res.status(500).send('Authentication failed');
    }
}
);

//Get Files created with help of node.js
app.get('/files', async (req, res) => {
    try {
        const response = await drive.files.list({
            pageSize: 10,
            fields: 'files(id, name)'
        });
        res.json(response.data.files);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//Create Folder with name
app.get('/createFolder', async (req, res) => {
    try {
        const response = await drive.files.create({
            requestBody: {
                name: 'New Folder',
                mimeType: 'application/vnd.google-apps.folder'
            }
        });
        res.json({
            message: 'Folder created successfully',
            id: response.data.id
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//To upload a text file
app.get('/upload', async (req, res) => {
    try {
        const response = await drive.files.create({
            requestBody: {
                name: 'hello.txt',
                mimeType: 'text/plain'
            },
            media: {
                mimeType: 'text/plain',
                body: 'Hello I am Jatin!'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//upload-image from local system
app.get('/upload-image', async (req, res) => {
    try {
        const response = await drive.files.create({
            requestBody: {
                name: "Uploaded-Image.png",
                mimeType: "image/jpeg",
                parents: ['1bn4QsLeWmmYtRLGVMhJxekBvSgXhAyLd']
            },
            media: {
                mimeType: "image/jpeg",
                body: fs.createReadStream("image.png")
            }
        })
        res.json({
            message: 'Image Uploaded successfully',
            id: response.data.id
        });
    }
    catch (error) {
        res.status(500).send(error.message);
    }
})

//delete file using file id
app.get('/remove-file/:fileId', async (req, res) => {
    try {
        await drive.files.delete({
            fileId: req.params.fileId
        });
        res.send('File deleted permanently');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//To give access to files
app.get('/giveAccess', async (req, res) => {
    try {
        const response = await drive.permissions.create({
            fileId: "14vc-0C-oL62xgDyLXDYGY0FNQI6Kkz1u",
            requestBody: {
                type: 'user',
                role: 'writer',
                emailAddress: 'jatin.batchu@kalvium.community'
            }
        });
        res.json({ message: `Public access granted successfully!`, permissionId: response.data.id });
        console.log(res)
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//To remove access
app.get('/removeAccess', async (req, res) => {
    try {
        await drive.permissions.delete({
            fileId: '14vc-0C-oL62xgDyLXDYGY0FNQI6Kkz1u',
            permissionId: "03207943428437250509"
        });
        res.json({ message: 'Access revoked' });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

//Set expiration
app.get('/setExpiration', (req, res) => {
    const expirationDate = '2025-02-15T12:00:00Z';

    drive.files.update({
        fileId: '1OaoI6T_v9NiXSkVddbcO9TtNyXuVtYGI',
        requestBody: {
            properties: {
                expirationDate: expirationDate,
            },
        },
    }).then(() => {
        console.log('Expiration date set');
        res.json({ message: 'Expiration date set successfully' });
    }).catch((error) => {
        console.error('Error setting expiration date:', error.message);
        res.status(500).send(error.message);
    });
});

//To delete files after expiration when sent get req.
app.get('/deleteExpirations', (req, res) => {
    drive.files.list({
        fields: 'files(id, name, properties)',
    })
        .then((response) => {
            const files = response.data.files;

            files.forEach((file) => {
                if (file.properties && file.properties.expirationDate) {
                    const expirationDate = new Date(file.properties.expirationDate);
                    const currentDate = new Date();

                    if (currentDate > expirationDate) {
                        drive.files.delete({ fileId: file.id })
                            .then(() => {
                                console.log(`File ${file.name} deleted because it expired.`);
                                res.json(`message: File ${file.name} deleted because it expired. `)
                            })
                            .catch((deleteError) => {
                                console.error(`Error deleting file ${file.name}:`, deleteError.message);
                            });
                    }
                } else {
                    res.json({ message: 'No files found to delete' })
                    console.log(`No files found to delete`)
                }
            });
        })
        .catch((error) => {
            console.error('Error retrieving files:', error.message);
        });
})

//To check and delete files automatically every 60 min
function deleteExpiredFiles() {
    drive.files.list({
        fields: 'files(id, name, properties)',
    })
        .then((response) => {
            const files = response.data.files;
            let deleted = false;

            files.forEach((file) => {
                if (file.properties && file.properties.expirationDate) {
                    const expirationDate = new Date(file.properties.expirationDate);
                    const currentDate = new Date();

                    if (currentDate > expirationDate) {
                        drive.files.delete({ fileId: file.id })
                            .then(() => {
                                console.log(`File ${file.name} deleted because it expired.`);
                            })
                            .catch((deleteError) => {
                                console.error(`Error deleting file ${file.name}:`, deleteError.message);
                            });
                        deleted = true;
                    }
                }
            });

            if (!deleted) {
                console.log("No expired files found to delete.");
            }
        })
        .catch((error) => {
            console.error('Error retrieving files:', error.message);
        });
}

const customMin = 30;
setInterval(deleteExpiredFiles, customMin * 60 * 1000);

app.listen(port, () => {
    try {
        const creds = fs.readFileSync("creds.json");
        oauth2Client.setCredentials(JSON.parse(creds));
        console.log("Tokens loaded successfully.");
    } catch (error) {
        console.log("No credentials file found or invalid JSON. Authenticate first!");
    }
    console.log(`Server running on port ${port}`);
});