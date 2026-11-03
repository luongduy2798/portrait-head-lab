@Library('shared-jenkins-pipeline-library') _

pipeline {
    agent any

    tools { nodejs "node" }

    environment {
        APP_NAME = 'portrait-head'
        ENVIRONMENT = "${env.BRANCH_NAME == 'prod' ? 'prod' : 'dev'}"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '3'))
    }

    stages {
        stage('Checkout code') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            when {
                anyOf {
                    branch 'main'
                    branch 'prod'
                    expression { (env.BRANCH_NAME ?: '') ==~ /deploy\/.*/ }
                }
            }

            steps {
                script {
                    configFileProvider([configFile(fileId: 'twa-global-npmrc-pull', variable: 'NPMRC')]) {
                        sh '''
                        npm cache clean --force
                        npm --userconfig="$NPMRC" ci
                        '''
                    }
                }
            }
        }

        stage('Build') {
            when {
                anyOf {
                    branch 'main'
                    branch 'prod'
                    expression { (env.BRANCH_NAME ?: '') ==~ /deploy\/.*/ }
                }
            }

            steps {
                sh '''
                cp templates/.env.${ENVIRONMENT} .env
                npm run build
                '''
            }
        }

        stage('Publish') {
            when {
                branch 'main'
            }

            steps {
                configFileProvider([configFile(fileId: 'twa-global-npmrc-push', variable: 'NPMRC')]) {
                    sh 'npm --userconfig="$NPMRC" publish'
                }
            }
        }
    }
}
