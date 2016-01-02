var React = require('react')
var Snackbar = require('material-ui/lib/snackbar')

var Settings = require('./Settings.jsx')
var updateVolunteer = require('../../actions').updateVolunteer

var ProfileSettings = React.createClass({

  getInitialState: function () {
    return {
      canSubmit: false
    }
  },

  enableButton: function () {
    this.setState({
      canSubmit: true
    });
  },

  disableButton: function () {
    this.setState({
      canSubmit: false
    });
  },

  handleSubmit: function(data) {
    //sugestia przy dodawaniu wolontariusza do aktywności
    if (data.first_name) {
      data.suggest = {
        input: [data.first_name, data.last_name],
        output: data.first_name+" "+data.last_name,
        payload: {
          id: this.props.profileId,
          email: data.email
        }
      }
    }
    data.id = this.props.profileId
    this.props.context.executeAction(updateVolunteer, data)
  },

  render: function() {
    var snackbar

    if (this.props.success) {
      snackbar = <Snackbar
        openOnMount={true}
        message="Zapisano"
        autoHideDuration={5000} />
    } else if (this.state.error ) {
      snackbar = <Snackbar
        openOnMount={true}
        message="Wystąpił błąd"
        autoHideDuration={5000} />
    }

    return (
      <Settings>
        <Formsy.Form className="settingsForm" onSubmit={this.handleSubmit} onValid={this.enableButton} onInvalid={this.disableButton}>

          {this.props.children}

          <div className="pure-g">
            <div className="pure-u-1 pure-u-md-1-3"></div>
            <div className="pure-u-1 pure-u-md-2-3">
              <button type="submit" className="pure-button pure-button-primary" disabled={!this.state.canSubmit}>
                Zmień
              </button>
            </div>
          </div>
        </Formsy.Form>
        {snackbar}
      </Settings>
    )
  }
})

module.exports = ProfileSettings