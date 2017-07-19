import { addFeedbackFile, clearFeedbackFiles, removeFeedbackFile } from '../actions/session';
import { IFeedbackFile } from '../types/IFeedbackFile';

import * as Promise from 'bluebird';
import { app as appIn, remote } from 'electron';
import * as fs from 'fs-extra-promise';
import * as update from 'immutability-helper';
import {
  actions, BinaryToggle, ComponentEx, Dropzone, Icon, IconBar, ITableRowAction, log, MainPage,
  Table, tooltip, types, util,
} from 'nmm-api';
import * as os from 'os';
import * as path from 'path';
import * as React from 'react';
import { Col, ControlLabel, DropdownButton, FormGroup, Grid,
  ListGroup, ListGroupItem, MenuItem, Row,
} from 'react-bootstrap';
import { translate } from 'react-i18next';
import { Fixed, Flex, Layout } from 'react-layout-pane';
import { connect } from 'react-redux';
import { dir as tmpDir, file as tmpFile } from 'tmp';

type ControlMode = 'urls' | 'files';

interface IConnectedProps {
  feedbackFiles: { [fileId: string]: IFeedbackFile };
}

interface IActionProps {
  onShowActivity: (message: string, id?: string) => void;
  onDismissNotification: (id: string) => void;
  onRemoveFeedbackFile: (feedbackFileId: string) => void;
  onShowDialog: (type: types.DialogType, title: string, content: types.IDialogContent,
                 actions: types.IDialogActions) => void;
  onShowError: (message: string, details?: string | Error, notificationId?: string) => void;
  onClearFeedbackFiles: () => void;
  onAddFeedbackFile: (feedbackFile: IFeedbackFile) => void;
}

type Props = IConnectedProps & IActionProps;

interface IComponentState {
  feedbackMessage: string;
  anonymous: boolean;
  sending: boolean;
}

const SAMPLE_REPORT = 'E.g. \n' +
  'Summary: The mod downloads properly but when I try to install it nothing happens.\n' +
  'Expected Results: The mod is installed. \n' +
  'Actual Results: Nothing happens. \n' +
  'Steps to reproduce: Download a mod, then click Install inside the Actions menu.';

class FeedbackPage extends ComponentEx<Props, IComponentState> {
  private feedbackActions: ITableRowAction[];

  constructor(props) {
    super(props);

    this.initState({
      feedbackMessage: '',
      anonymous: false,
      sending: false,
    });

    this.feedbackActions = [
      {
        icon: 'remove',
        title: props.t('Delete'),
        action: this.remove,
      },
    ];
  }

  public render(): JSX.Element {
    const { feedbackFiles, t } = this.props;

    return (
      <MainPage>
        <Layout type='column' className='feedback-page'>
          <Fixed>
            <div>
              <h3>{t('Provide Feedback\n')}</h3>
            </div>
            <h4>
              {t('Describe in detail what you were doing and the feedback ' +
                 'you would like to submit')}
            </h4>
          </Fixed>
          {this.renderMessageArea()}
          {this.renderFilesArea()}
        </Layout>
      </MainPage>
    );
  }

  private renderFeedbackFile = (feedbackFile: string) => {
    const { feedbackFiles, onRemoveFeedbackFile, t } = this.props;
    return (
      <ListGroupItem
        key={feedbackFiles[feedbackFile].filename}
      >
        <p style={{ display: 'inline' }}>
          {feedbackFiles[feedbackFile].filename}
        </p>
        <p style={{ display: 'inline' }}>
          {' '}({ util.bytesToString(feedbackFiles[feedbackFile].size) })
        </p>
        <tooltip.IconButton
          className='btn-embed btn-line-right'
          id={feedbackFiles[feedbackFile].filename}
          key={feedbackFiles[feedbackFile].filename}
          tooltip={t('Remove')}
          onClick={this.remove}
          icon='remove'
        />
      </ListGroupItem>
    );
  }

  private dropFeedback = (type: ControlMode, feedbackFilePaths: string[]) => {
    const { onAddFeedbackFile } = this.props;

    if (feedbackFilePaths.length === 0) {
      return;
    }

    if (type === 'files') {
      fs.statAsync(feedbackFilePaths[0])
        .then((stats) => {
          const feedbackFile: IFeedbackFile = {
            filename: path.basename(feedbackFilePaths[0]),
            filePath: feedbackFilePaths[0],
            size: stats.size,
            type: path.extname(feedbackFilePaths[0]),
          };

          onAddFeedbackFile(feedbackFile);
        });
    }
  }

  private remove = (evt) => {
    const { onRemoveFeedbackFile } = this.props;
    const feedbackFileId = evt.currentTarget.id;
    onRemoveFeedbackFile(feedbackFileId);
  }

  private renderMessageArea = () => {
    const { t } = this.props;
    const { feedbackMessage } = this.state;
    return (
      <Flex>
        <textarea
          value={feedbackMessage}
          id='textarea-feedback'
          className='textarea-feedback'
          onChange={this.handleChange}
          placeholder={t(SAMPLE_REPORT)}
        />
      </Flex>
    );
  }

  private renderAttachButton(): JSX.Element {
    const { t } = this.props;
    return (
      <DropdownButton
        id='btn-attach-feedback'
        title={t('Attach')}
        onSelect={this.attach}
      >
        <MenuItem draggable={false} eventKey='sysinfo'>{t('System Information')}</MenuItem>
        <MenuItem draggable={false} eventKey='log'>{t('Vortex Log')}</MenuItem>
        <MenuItem draggable={false} eventKey='settings'>{t('Application Settings')}</MenuItem>
        <MenuItem draggable={false} eventKey='state'>{t('Application State')}</MenuItem>
      </DropdownButton>
    );
  }

  private renderFilesArea(): JSX.Element {
    const { t, feedbackFiles } = this.props;
    const { anonymous, sending } = this.state;
    return (
      <Fixed>
        <Layout type='row' style={{ position: 'static' }}>
          <Flex>
            <FormGroup>
              <ControlLabel>{t('Attached Files')}</ControlLabel>
              <ListGroup>
                {Object.keys(feedbackFiles).map(this.renderFeedbackFile)}
              </ListGroup>
            </FormGroup>
            {this.renderAttachButton()}
            <Dropzone
              accept={['files']}
              drop={this.dropFeedback}
              dialogHint={t('Drop the feedback file here')}
            />
          </Flex>
          <Fixed>
            <tooltip.Button
              style={{ display: 'block', marginLeft: 'auto', marginRight: 0 }}
              id='btn-submit-feedback'
              tooltip={t('Submit Feedback')}
              onClick={this.submitFeedback}
              disabled={sending}
            >
              {t('Submit Feedback')}
            </tooltip.Button>
            <BinaryToggle
              value={anonymous}
              onToggle={this.setAnonymous}
            >
              {t('Send anonymously')}
            </BinaryToggle>
          </Fixed>
        </Layout>
      </Fixed>
    );
  }

  private setAnonymous = (value: boolean) => {
    this.nextState.anonymous = value;
  }

  private attach = (eventKey: any) => {
    const { t, onShowDialog } = this.props;
    switch (eventKey) {
      case 'sysinfo': this.addSystemInfo(); break;
      case 'log': this.attachLog(); break;
      case 'settings': {
        onShowDialog('question', t('Confirm'), {
          message: t('This will attach your Vortex setting to the report, not including ' +
            'confidential data like usernames and passwords. ' +
            'We have no control over what third-party extensions store in settings though.'),
        }, {
            Cancel: null,
            Continue: () => {
              this.attachState('settings', 'Vortex Settings');
            },
          });
        break;
      }
      case 'state': {
        onShowDialog('question', t('Confirm'), {
          message:
          t('This will attach your Vortex state to the report. This includes things like ' +
            'your downloaded and installed mods, games, profiles and categories. ' +
            'These could be very useful for understanding your feedback but you have ' +
            'decide if you are willing to share this informaiton. ' +
            'We will, of course, treat your information as confidential.'),
        }, {
            Cancel: null,
            Continue: () => {
              this.attachState('persistent', 'Vortex State');
            },
          });
        break;
      }
    }
  }

  private addSystemInfo() {
    const sysInfo: string[] = [
      'Vortex Version: ' + remote.app.getVersion(),
      'Memory: ' + util.bytesToString((process as any).getSystemMemoryInfo().total * 1024),
      'System: ' + `${os.platform()} (${os.release()})`,
    ];
    this.nextState.feedbackMessage = sysInfo.join('\n') + '\n' + this.state.feedbackMessage;
  }

  private attachState(stateKey: string, name: string) {
    const { t, onAddFeedbackFile } = this.props;
    const data: Buffer = Buffer.from(JSON.stringify(this.context.api.store.getState()[stateKey]));
    const filePath = tmpFile({
      prefix: `${stateKey}-`,
      postfix: '.json',
    }, (err, tmpPath: string, fd: number, cleanup: () => void) => {
      fs.writeAsync(fd, data, 0, data.byteLength, 0)
        .then(() => fs.closeAsync(fd))
        .then(() => {
          onAddFeedbackFile({
            filename: name,
            filePath: tmpPath,
            size: data.byteLength,
            type: 'State',
          });
        });
    });
  }

  private attachLog() {
    const { onAddFeedbackFile } = this.props;

    const logFile = path.join(remote.app.getPath('userData'), 'vortex.log');

    fs.statAsync(logFile)
      .then((stats) => {
        onAddFeedbackFile({
          filename: path.basename(logFile),
          filePath: logFile,
          size: stats.size,
          type: 'Log',
        });
      });
  }

  private submitFeedback = (event) => {
    const { feedbackFiles, onClearFeedbackFiles, onDismissNotification,
            onShowActivity, onShowError } = this.props;
    const { anonymous, feedbackMessage } = this.state;
    const app = appIn || remote.app;

    const notificationId = 'submit-feedback';
    onShowActivity('Submitting feedback', notificationId);

    this.nextState.sending = true;

    const files: string[] = [];
    Object.keys(feedbackFiles).forEach (key => {
      files.push(feedbackFiles[key].filePath);
    });

    this.context.api.events.emit('submit-feedback',
                                 feedbackMessage, files, anonymous, (err: Error) => {
      this.nextState.sending = false;
      if (err !== null) {
        onShowError('Failed to send feedback', err, notificationId);
        return;
      }

      this.nextState.feedbackMessage = '';

      let removeFiles: string[];

      if (feedbackFiles !== undefined) {
        removeFiles = Object.keys(feedbackFiles)
          .filter(fileId => ['State', 'Dump', 'LogCopy'].indexOf(feedbackFiles[fileId].type) !== -1)
          .map(fileId => feedbackFiles[fileId].filePath);
      }

      if (removeFiles !== undefined) {
        Promise.map(removeFiles, removeFile => fs.removeAsync(removeFile))
          .then(() => {
            onClearFeedbackFiles();
            onDismissNotification(notificationId);
          })
          .catch(innerErr => {
            onShowError('An error occurred removing a file', innerErr, notificationId);
        });
      }
    });
  }

  private handleChange = (event) => {
    this.nextState.feedbackMessage = event.currentTarget.value;
  }
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
    onShowActivity: (message: string, id?: string) =>
      util.showActivity(dispatch, message, id),
    onRemoveFeedbackFile: (feedbackFileId: string) =>
      dispatch(removeFeedbackFile(feedbackFileId)),
    onShowDialog: (type, title, content, dialogActions) =>
      dispatch(actions.showDialog(type, title, content, dialogActions)),
    onShowError: (message: string, details?: string | Error, notificationId?: string) =>
      util.showError(dispatch, message, details, false, notificationId),
    onDismissNotification: (id: string) => dispatch(actions.dismissNotification(id)),
    onClearFeedbackFiles: () => dispatch(clearFeedbackFiles()),
    onAddFeedbackFile: (feedbackFile) => dispatch(addFeedbackFile(feedbackFile)),
  };
}

function mapStateToProps(state: any): IConnectedProps {
  return {
    feedbackFiles: state.session.feedback.feedbackFiles,
  };
}

export default
  translate(['common'], { wait: false })(
    connect(mapStateToProps, mapDispatchToProps)(FeedbackPage),
 ) as React.ComponentClass<{}>;