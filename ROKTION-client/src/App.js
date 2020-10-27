import React, { Component } from 'react';
import SocketIO from 'socket.io-client';
import DocumentPage from './components/DocumentPage';
import MainMenuLayout from './components/MainMenuLayout';
import LoginPage from './components/LoginPage';
import {
    Transition,
  } from 'semantic-ui-react'


class App extends Component {
    constructor(props){
        super(props);
        this.state = {
            loginStatus: 0,
            userInfo:{
                regiment:null,
                rank:null,
                name:null,
            },
            selectedDocumentId: -1,
            tags:[],
            documents:[]
          };
    }

    onLogin = (id, pw) => {
        fetch('/api/user/login', {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: id,
                pw: pw
            })
        })
        .then(res => {
            if (res.status === 200) {
                return fetch(`/api/user/${id}`, { 
                    method: 'GET',
                })
            } else {
                console.error(res.status);
            }
        })
        .then(data => {
            if (data.status !== 200) {
                alert('Wrong ID or password');
                throw new Error(`Wrong ID or password`);
            }
            return data.json();
        })
        .then(userData => {
            if (userData === null) {
                alert('Wrong ID or password');
                throw new Error(`Wrong ID or password`);
            }
            //console.log(userData);
            this.setState({
                userInfo: userData,
                loginStatus: 1
            });
            //console.log(this.state.documents);
            this.getUserTags();
            return this.getDocumentList();
        })
        .then(() => {
            window.socket = SocketIO.connect(window.location.hostname, {
                reconnection: false,
            });
            this.createSocketActions();
            // 처음 소켓 연결 후 하는 동작들
            window.socket.emit('linkData', {
                tagId: this.state.userInfo.tagId,
            });
        })
        .catch(e => {
            console.error(e);
        }) 
    }

    onLogout = () => {
        // 서버에 로그오프 요청을 보낸다.
        fetch('/api/user/logoff', {
            method: 'GET'
        })
        .then(res => {
            if (res.status === 200) {
                this.socket.disconnect();
                console.log('Completely logoff');
            } else {
                console.error(res.status);
            }
        })
        .then(() => {
            // UserInfo null로 돌려놓기, Document나 Tag들도 리셋해야됨.
            this.setState({
                loginStatus: 0,
                selectedDocumentId:-1,
                userInfo:{
                    regiment:null,
                    rank:null,
                    name:null,
                },
                documents: [],
                tags:[],
            });
        })
        .catch(e => {
            console.error(e);
        })
    }

    createSocketActions = () => {
        // 기본적인 동작
        window.socket.on('test', (jsonData) => {
            console.log(JSON.parse(jsonData).message);
        });
    }

    getUserTags = () => {
        console.log('Start getUserTags');
        const tags = this.state.userInfo.tags;
        for (let i = 0; i < tags.length; ++i) {
            this.addNewTag(tags[i].name, tags[i].color);
        }
        console.log(this.state.tags)
        console.log('End getUserTags');
    }
    
    getDocumentList = () => {
        console.log('Start getDocumentList');
        const relatedDocs = this.state.userInfo.relatedDocs;
        const docsAlready = 0; // 임시용
        for (let i = docsAlready; i < relatedDocs.created.length + docsAlready; ++i) {
            // 이거 비동기로 돌아감
            fetch(`/api/docs/${relatedDocs.created[i - docsAlready].docId}`, {
                method: 'GET'
            })
            .then(res => {
                return res.json();
            })
            .then(docInfo => {
                let newState = this.state.documents;
                let newTags = relatedDocs.created[i - docsAlready].docTags;
                newTags.push(docInfo.status);
                const newAlert = relatedDocs.created[i - docsAlready].alert;
                newState[i] = {
                    title: docInfo.title,
                    admin: docInfo.author,
                    description: docInfo.description,
                    // alert 임시용
                    alert: newAlert,
                    id: i,
                    color: docInfo.titleColor,
                    dbId: docInfo._id,
                    tags: new Set(newTags),
                    onClick: () => {this.setState({selectedDocumentId: i})},
                    documentContent: [],
                    isDocumentContentLoaded: -1, // -1: 미로딩, 0: 로딩중, 1: 로딩완료
                    pagesLength: docInfo.contents.length,
                }
                this.setState({
                    documents: newState
                }); 
                console.log(this.state.documents[i])
            })
            .catch(e => {
                console.error(e);
            })
        }
        console.log('End getDocumentList');
    }

    getPageContents = (document, idx) => {
        document.isDocumentContentLoaded = 0;
        for (let i = 0; i < document.pagesLength; ++i) {
            fetch(`/api/docs/${document.dbId}/${i}`, {
                method: 'GET'
            })
            .then(res => {
                return res.json();
            })
            .then(page => {
                if (page === null) {
                    throw new Error(`Got NULL page, ${document.dbId}/${i}`)
                }
                //console.log(page);
                let docs = this.state.documents;
                //console.log(docs[idx]);
                docs[idx].documentContent[i] = 
                {
                    content: page.content,
                    updateLocalPageContents: this.updateLocalPageContents,
                    idx: idx,
                    page: i,
                    dbId: document.dbId,
                };
                ++(docs[idx].isDocumentContentLoaded);
                this.setState({
                    documents: docs,
                });
            })
            .catch(e => {
                console.error(e);
            })
        }
    }

    addPageAfter = (afterPageIdx) => {
        return new Promise((resolve, reject) => {
            fetch(`/api/docs/${this.state.documents[this.state.selectedDocumentId].dbId}`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        afterIdx: afterPageIdx
                    })
            })
            .then(res => {
                console.log(afterPageIdx)
                if (res.status === 201) {
                    const docs = this.state.documents;
                    for (let i = afterPageIdx + 2; i < docs[this.state.selectedDocumentId].documentContent.length; ++i) {
                        docs[this.state.selectedDocumentId].documentContent[i].page = i + 1;
                    }
                    docs[this.state.selectedDocumentId].documentContent.splice(afterPageIdx + 1, 0, {
                        content: '',
                        updateLocalPageContents: this.updateLocalPageContents,
                        idx: this.state.selectedDocumentId,
                        page: afterPageIdx + 1,
                        dbId: docs[this.state.selectedDocumentId].dbId,
                    });
                    ++docs.pagesLength;
                    this.setState({
                        documents: docs,
                    });
                } else {
                    throw new Error(res.json());
                }
            })
            .then(() => {
                resolve();
            })
            .catch(e => {
                reject(e);
            })
        })
    }

    removePage = (rmIdx) => {
        return new Promise((resolve, reject) => {
            fetch(`/api/docs/${this.state.documents[this.state.selectedDocumentId].dbId}/${rmIdx}`, {
                method: 'DELETE',
            })
            .then(res => {
                if (res.status === 200) {
                    const docs = this.state.documents;
                    docs[this.state.selectedDocumentId].documentContent.splice(rmIdx, 1);
                    for (let i = rmIdx; i < docs[this.state.selectedDocumentId].documentContent.length; ++i) {
                        docs[this.state.selectedDocumentId].documentContent[i].page = i;
                    }
                    --docs.pagesLength;
                    this.setState({
                        documents: docs,
                    })
                } else {
                    throw new Error(res.json());
                }
            })
            .then(() => {
                resolve();
            })
            .catch(e => {
                reject(e);
            })
        })
    }

    updateLocalPageContents = (idx, page, content) => {
        let docs = this.state.documents;
        //console.log(docs[idx]);
        docs[idx].documentContent[page].content = content;
        this.setState({
            documents: docs,
        })
    }
        
    addNewTag = (name, color, isNew = false) => {
        const tags = this.state.tags;
        this.setState({
            tags: tags.concat({
                name: name,
                id: tags.length,
                color: color,
            }),
        })
        
        if (isNew) {
            // 서버에 추가한 태그를 보낸다
            fetch(`/api/user/${this.state.userInfo.tagId}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tags: {
                        action: 'add',
                        name: name,
                        color: color,
                    }
                })
            });
        }
    }

    deleteTag = (id) => {
        // 0번부터 4번까지는 기본태그기 때문에 삭제 불가능하게 해야됨
        // MainMenuLayout에서 일차적으로 방지하긴 함
        if(id <= 4) return;

        let tags = this.state.tags;
        const idx = tags.findIndex(tag => (tag.id === id));
        if (idx > -1){
            tags.splice(idx, 1);
            this.setState({
                tags:tags,
            })
        }

        // 서버에 삭제한 태그의 index를 보낸다.
        fetch(`/api/user/${this.state.userInfo.tagId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tags: {
                    action: 'del',
                    idx: idx
                }
            })
        });
    }

    toggleTagInDocument = (docid, tagid) => {
        const docs = this.state.documents;
        const doc = docs.find(doc => (doc.id===docid));
        let action;
        if (tagid <= 3){
            //주요태그 (진행중/예정됨/완료됨/문서)
            doc.tags.delete(0);
            doc.tags.delete(1);
            doc.tags.delete(2);
            doc.tags.delete(3);
            doc.tags.add(tagid);
            action = 'default';
        }
        else if (doc.tags.has(tagid)){
            //태그삭제
            doc.tags.delete(tagid);
            action = 'del';
        }
        else{
            //태그추가
            doc.tags.add(tagid);
            action = 'add';
        }

        this.setState({
            documents:
                docs.map(
                    doc => (
                        doc.id === docid ?
                        {...doc, tags:doc.tags}:
                        {...doc}
                    )
                )
        })

        fetch(`/api/user/${this.state.userInfo.tagId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                docTags: {
                    action: action,
                    docId: doc.dbId,
                    tagId: tagid,
                }
            })
        });
    }

    changeDocumentSettings = (docid, color, title) => {
        const docs = this.state.documents;
        this.setState({
            documents:
                docs.map(
                    doc => (
                        doc.id === docid ?
                        {...doc, color:color, title:title}:
                        {...doc}
                    )
                )
        })

        fetch(`/api/docs/${docs.find(doc => doc.id === docid).dbId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title,
                color: color,
            })
        });
    }

    createNewDocument = () => {
        //기본 문서 생성
        //console.log(this.state.documents, this.state.tags)
        const docs = this.state.documents;
        const newDoc = {
            title: "새 문서" + docs.length,
            description: '',
            alert: docs.length,
            //!!!!!!! 임시 !!!!!!!!
            id: docs.length,
            color: (() => {
                var letters = '0123456789ABCDEF';
                var color = '#';
                for (var i = 0; i < 6; i++) {
                  color += letters[Math.floor(Math.random() * 16)];
                }
                return color;
              })(),
            tags: new Set([0]),
            onClick: () => {this.setState({selectedDocumentId: docs.length})},
            isDocumentContentLoaded: -1,
            documentContent: [],
            pagesLength: 1,
        }
        // start loading screen
        fetch('/api/docs/', {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: newDoc.title,
                color: newDoc.color,
            })
        })
        .then(res => {
            if (res.status === 201) {
                return res.json();
            } else {
                throw res.json();
            }
        })
        .then(data => {
            newDoc.admin = data.author;
            newDoc.dbId = data.dbId;
            //console.log(newDoc);
            this.setState({
                documents: [newDoc, ...docs],
            }); 
            this.reindexingDocuments();
        })
        .then(() => {
            // end loading screen
        })
        .catch(e => {
            console.error(new Error(`Fail at create document, ${e}`));
        })
    }

    deleteDocument = (docid) => {
        let docs = this.state.documents;
        const idx = docs.findIndex(doc => (doc.id === docid));

        if (idx > -1) {
            fetch(`/api/docs/${docs[idx].dbId}`, {
                method: 'DELETE',
            })
            .then(res => {
                if (res.status === 200) {
                    return;
                } else {
                    throw new Error(`Not deleted`);
                }
            })
            .then(() => {
                docs.splice(idx, 1);
                this.setState({
                    documents:docs,
                })
                this.reindexingDocuments();
            })
            .catch(e => {
                console.error(e);
            })
        } else {
            console.error(`Cannot find doc with ${docid}`);
        }
    }

    reindexingDocuments = () => {
        const docs = this.state.documents;
        this.setState({
            documents: docs.map((doc, idx) => {
                doc.id = idx;
                doc.onClick = () => {this.setState({selectedDocumentId: idx})};
                doc.documentContent = doc.documentContent.map(cont => {
                    cont.idx = idx;
                    return cont;
                });
                return doc;
            })
        });
    }

    createNewUser = (newUser) => {
        // 음...
        console.log(newUser);
    }
    
    componentDidUpdate() {
        let {selectedDocumentId, documents} = this.state;
        let selectedDocument = documents.find(doc => doc?.id === selectedDocumentId);
        if (selectedDocument !== undefined && selectedDocument.isDocumentContentLoaded < 0) {
            this.getPageContents(selectedDocument, selectedDocumentId);
        }
    }

    render() {
        // 0:로그인화면   1:로그인됨 
        switch(this.state.loginStatus) {
            case 0:
                return(
                    <LoginPage
                        handleLogin={this.onLogin}
                        createNewUser={this.createNewUser}
                    />
                );
            case 1:
                let {selectedDocumentId, documents} = this.state;
                let selectedDocument = documents.find(doc => doc?.id === selectedDocumentId);
                //console.log(selectedDocument);

                return (
                    selectedDocument !== undefined ?
                        <Transition onShow={()=>{console.log("mounted")}} transitionOnMount={true} unmountOnHide={true} duration ={{hide:500, show:500}}>
                            <DocumentPage
                            handleLogout={this.onLogout}
                            information={this.state}
                            toMainMenu={()=>{this.setState({selectedDocumentId:-1});}}
                            addPageAfter={this.addPageAfter}
                            removePage={this.removePage}
                            />
                        </Transition>:
                        <Transition transitionOnMount={true} unmountOnHide={true} duration ={{hide:500, show:500}}>
                            <MainMenuLayout
                            handleLogout={this.onLogout}
                            userInfo={this.state.userInfo}
                            addNewTag={this.addNewTag}
                            deleteTag={this.deleteTag}
                            changeDocumentSettings={this.changeDocumentSettings}
                            toggleTagInDocument={this.toggleTagInDocument}
                            createNewDocument={this.createNewDocument}
                            deleteDocument={this.deleteDocument}
                            documents={this.state.documents}
                            tags={this.state.tags}/>
                        </Transition>
                );
            default:
                break;
        }
    }
};

export default App;
