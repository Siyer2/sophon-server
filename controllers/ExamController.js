var router = (require('express')).Router();
var EC2 = require('../services/EC2');
var AWS = require('aws-sdk');
var moment = require('moment');
var s3Zip = require('s3-zip');
var path = require('path');
var { ObjectId } = require('mongodb');
var passport = require('passport');
var fs = require('fs');
AWS.config.loadFromPath('./awsKeys.json');
var moment = require('moment');
const config = require('../config');
const formidableMiddleware = require('express-formidable');
const { Consumer } = require('sqs-consumer');

// Lecturer creates exam; params: examName, file, application
router.post('/create', [passport.authenticate('jwt', { session: false }), formidableMiddleware()], async function (request, response) {
    const lecturerId = request.user._id.toString();

    try {
        // Parse the request
        const filePath = request.files.file.path;
        const fileName = request.files.file.name.replace(/ /g, "_");
        const file = fs.createReadStream(filePath);

        // Create an exam code
        const examCode = await createUniqueExamCode(request.db);

        // Upload files to S3
        const questionLocation = await uploadToS3(file, `${lecturerId}/${examCode}/${fileName}`, config.settings.UPLOAD_BUCKET);

        // Save the exam code, start up message, applications in the database
        const exam = await request.db.collection("exams").insertOne({
            lecturerId,
            examName: request.fields.examName,
            examCode,
            application: request.fields.applicationId,
            questionLocation: questionLocation,
            time: moment().utc().format()
        });

        // Return the exam code
        return response.json({ exam: exam.ops[0] });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Student enters exam
router.post('/enter', async function (request, response) {
    try {
        const examCode = request.body.examCode;
        const studentId = request.body.studentId;

        // Get the exam (including applications and startup message)
        const exam = await request.db.collection("exams").findOne({ examCode: examCode, $or: [{ isClosed: false }, { isClosed: { $exists: false } }] });
        if (!exam) {
            return response.status(200).json({ error: `Couldn't find an open exam with code ${examCode}` });
        }

        // Check that there isn't another student with the same ID already in the exam
        const alreadyEnteredExam = await request.db.collection("examEntrances").findOne({ examCode, studentId });
        if (alreadyEnteredExam) {
            return response.status(200).json({ error: `${studentId} has already entered this exam` });
        }

        // Get the right AMI for the application
        const AMI = (await request.db.collection("applications").findOne({ _id: ObjectId(exam.application) })).AMIId;

        // Start a new EC2 and return it's IP address
        const tags = [
            {
                Key: "ExamCode",
                Value: examCode
            },
            {
                Key: "StudentId",
                Value: studentId
            }
        ];

        const userdata = `<powershell>\nCopy-S3Object -BucketName ${config.settings.UPLOAD_BUCKET} -KeyPrefix ${exam.lecturerId}\\${examCode} -LocalFolder C:\\Users\\DefaultAccount\\Desktop -Region ap-southeast-2\nSend-SQSMessage -MessageBody (wget http://169.254.169.254/latest/meta-data/instance-id).Content -QueueUrl https://sqs.ap-southeast-2.amazonaws.com/149750655235/scriptUpdates\n</powershell>`;
        const createEC2 = await EC2.createEC2s(1, tags, AMI, userdata); 
        const instanceId = createEC2.Instances[0].InstanceId;

        // Wait till running
        const runningEC2 = (await EC2.waitFor("instanceRunning", instanceId)).Reservations[0].Instances[0];
        console.log("Instance running...", instanceId);
        
        // Get the appropriate IP address
        // If in VPC, need to use the private ip address, else use public
        const targetHost = (process.env.DEPLOYMENT !== 'production') ? runningEC2.PublicIpAddress : runningEC2.PrivateIpAddress;

        // Store the student entrance in Mongo
        const examEntrance = await request.db.collection("examEntrances").insertOne({
            ip: targetHost,
            examId: String(exam._id),
            studentId,
            examCode,
            startTime: moment().utc().format(),
            instanceId
        });

        return response.json({ status: 'ready', examEntranceId: examEntrance.ops[0]._id.toString() });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lists lecturer's exams
router.get('/list', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const exams = await request.db.collection("exams").find({ lecturerId: request.user._id.toString() }).toArray();

        return response.json({ exams });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// List students in an exam
router.post('/studentlist', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const examId = request.body.examId;
        const students = await request.db.collection("examEntrances").find({ examId: String(examId) }).toArray();

        return response.json({ students });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lecturer downloads students submission folder
router.post('/download', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const submissionLocation = request.body.submissionLocation;
        const s3 = new AWS.S3();

        const s3Objects = await s3
            .listObjectsV2({ Bucket: config.settings.SUBMISSION_BUCKET, Prefix: submissionLocation })
            .promise();

        if (!s3Objects.Contents.length) {
            return response.status(500).json({ error: "Student didn't submit anything." });
        }

        const filesArray = s3Objects.Contents.map((file) => {
            const filename = path.basename(file.Key);
            return filename;
        });

        response.set('content-type', 'application/zip');
        response.header('Content-Disposition', `attachment; filename="student.zip"`);

        s3Zip
            .archive({ s3: s3, bucket: config.settings.SUBMISSION_BUCKET }, submissionLocation, filesArray)
            .pipe(response)


    } catch (error) {
        console.log("error", error);
        return response.status(500).json({ error });
    }
});

// List available applications
router.get('/applications', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const applications = await request.db.collection("applications").aggregate([
            {
                '$project': {
                    '_id': 1, 
                    'name': 1
                }
            }
        ]).toArray();

        return response.json({ applications });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lecturer closes or opens an exam
router.post('/toggleClose', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const examId = request.body.examId;
        const exam = await request.db.collection("exams").findOne({ _id: ObjectId(examId) });
        const isClosed = exam.isClosed ? exam.isClosed : false;

        await request.db.collection("exams").updateOne(
            { _id: ObjectId(examId) },
            { $set: { isClosed: !isClosed } }
        );

        return response.json({ status: `${!isClosed === true ? "Closed" : "Opened"} exam with ID ${examId}` });
    } catch (error) {
        return response.status(500).json({ error });
    }
});

// Lecturer deletes an exam
router.post('/delete', passport.authenticate('jwt', { session: false }), async function (request, response) {
    try {
        const examCode = (await request.db.collection("exams").findOne({ _id: ObjectId(request.body.examId) })).examCode;

        // Empty the lecturer's questions from S3
        await emptyS3Directory(config.settings.UPLOAD_BUCKET, `${request.user._id.toString()}/${examCode}`);

        // Empty the student's submissions from S3 
        await emptyS3Directory(config.settings.SUBMISSION_BUCKET, `${request.user._id.toString()}/${examCode}`);

        // Delete the exam
        await request.db.collection("exams").deleteOne({ _id: ObjectId(request.body.examId) });

        return response.send("success");
    } catch (error) {
        return response.status(500).json({ error });
    }
});

//== Helper Functions ==//
function uploadToS3(file, filepath, bucket) {
    return new Promise(async (resolve, reject) => {
        try {
            var s3 = new AWS.S3({
                apiVersion: '2006-03-01',
                params: {
                    Bucket: bucket
                }
            });

            const uploadParams = {
                Bucket: bucket,
                Key: filepath,
                Body: file
            }

            s3.upload(uploadParams, function (err, data) {
                if (err) {
                    console.log("AWS ERROR UPLOADING TO S3", err);
                } if (data) {
                    resolve(data.Location);
                }
            });
        } catch (ex) {
            console.log("EXCEPTION UPLOADING TO S3", ex);
            reject(ex);
        }
    });
}

function createUniqueExamCode(db) {
    return new Promise(async (resolve, reject) => {
        try {
            // Create a code
            const code = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 8);

            // Check if it's unique
            const codeExists = await db.collection('exams').findOne({ examCode: code });
            if (codeExists) {
                createUniqueExamCode(db);
            }
            else {
                resolve(code);
            }
        } catch (ex) {
            console.log("EXCEPTION CREATING UNIQUE EXAM CODE");
            reject(ex);
        }
    });
}

async function emptyS3Directory(bucket, dir) {
    const listParams = {
        Bucket: bucket,
        Prefix: dir
    };

    const s3 = new AWS.S3();
    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (listedObjects.Contents.length === 0) return;

    const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: [] }
    };

    listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key });
    });

    await s3.deleteObjects(deleteParams).promise();

    if (listedObjects.IsTruncated) await emptyS3Directory(bucket, dir);
}
//== End Helper Functions ==//

module.exports = router;