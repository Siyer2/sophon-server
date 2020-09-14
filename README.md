# sophon-server


# To run:
- Create an IAM role in AWS called awsKeys.json with following permissions:
AmazonEC2FullAccess
AmazonSQSFullAccess
AmazonEC2RoleforSSM
AmazonS3FullAccess
AmazonSSMManagedInstanceCore
AmazonSSMFullAccess
An inline policy that allows IAM read-write

- Set .env DEPLOYMENT variable to local, staging or production
- npm install
- node index.js