<script setup>
import HelloWorld from './components/HelloWorld.vue'
import { ref, reactive, onMounted, toRaw, watch } from 'vue'

const messageInput = ref(null)
const chatMessagesEnd = ref(null);

const state = reactive({
  messageHistory: [],
  isChatting: false
})

watch(() => state.isChatting,
  (isChatting) => {
    if (isChatting) {
      setTimeout(() => {
        messageInput.value.focus();
      }, 10);
    }
  });

const messageHistory = state.messageHistory;

window.messageHistory = messageHistory;

const actionHistory = [];

const scrollRequestQueue = [];
const scrollInterval = setInterval(() => {
  if (scrollRequestQueue.length > 0) {
    scrollToBottom();
    scrollRequestQueue.shift();
  }
}, 500);

function scrollToBottom() {
  chatMessagesEnd.value.scrollIntoView({
    behavior: "smooth"
  });
}

function submitScrollRequest() {
  if (scrollRequestQueue.length == 0) {
    scrollRequestQueue.push(true);

    // force scroll now so don't have to wait for interval delay
    scrollToBottom();
  }
}

function stripResponse(content) {
  // handle case of >>>. instead of >>>
  content = content.replace(">>>.", ">>>");

  var start = content.indexOf("<<<");
  var end = content.indexOf(">>>");

  if (start != -1 && end != -1) {
    var message = content.substring(0, start) + content.substring(end + 3);

    return message;
  } else if (start != -1) {
    var message = content.substring(0, start);

    return message;
  } else {
    return content;
  }
}

function parseResponse(content) {
  // Example response:
  // Hello there! I am ready to assist you. <<< State=Idle, Emote=None, Expression=[Angry=0, Surprised=0, Sad=0] >>>. How can I help you today?

  // handle case of >>>. instead of >>>
  content = content.replace(">>>.", ">>>");

  // The prompt uses "Thumbs Up" instead of "ThumbsUp" to help the AI model understand it better
  content = content.replace("Emote=Thumbs Up", "Emote=ThumbsUp")

  var start = content.indexOf("<<<");
  var end = content.indexOf(">>>");

  if (start != -1 && end != -1) {
    var footnote = content.substring(start, end + 3);
    var message = content.substring(0, start) + content.substring(end + 3);

    var state = footnote.match(/State=(\w+)/)[1];
    var emote = footnote.match(/Emote=(\w+)/)[1];

    var expressionMatches = footnote.match(/Expression=\[(\w+=\d+\.?\d*,\s\w+=\d+\.?\d*,\s\w+=\d+\.?\d*)\]/);
    console.log(footnote);
    console.log(expressionMatches);
    var expression = expressionMatches[1];

    // match color in hex format like "0xff990b"
    var colorMatches = footnote.match(/Color=0x([0-9a-fA-F]{6})/);
    var color = colorMatches ? '0x' + colorMatches[1] : null;

    var expressionMap = {};
    expression.split(", ").forEach((item) => {
      var [key, value] = item.split("=");
      expressionMap[key] = value;
    });

    var expressionVector = [
      Number(expressionMap["Angry"]),
      Number(expressionMap["Surprised"]),
      Number(expressionMap["Sad"])
    ];

    return {
      message: message,
      state: state,
      emote: emote,
      expressionMap: expressionMap,
      expressionVector: expressionVector,
      color: color
    };
  } else {
    throw 'Footnote not found in response'
  }
}

async function sendMessage(message) {
  messageHistory.push(message);

  messageHistory.push({
    role: "assistant",
    content: ""
  });
  const responseMessageIndex = messageHistory.length - 1;

  const actionIndex = actionHistory.length;
  actionHistory.push(null);

  const inputMessages = toRaw(messageHistory).slice(0, messageHistory.length - 1).map((message) => {
    return {
      role: message.role,
      content: message.content
    };
  });
  console.log('inputMessages:');
  console.log(inputMessages);

  try {
    const response = await window.ai.getCompletion(
      {
        messages: inputMessages
      },
      {
        onStreamResult: (res, error) => {
          if (error) {
            console.error(error);
            return;
          }

          if (res) {
            messageHistory[responseMessageIndex].content += res.message.content;
            // console.log(messageHistory[responseMessageIndex]);
            // console.log(messageHistory);

            try {
              var strippedResponse = stripResponse(messageHistory[responseMessageIndex].content);
              messageHistory[responseMessageIndex].displayContent = strippedResponse;

              submitScrollRequest();

              var parsedResponse = parseResponse(messageHistory[responseMessageIndex].content);

              if (actionHistory[actionIndex] == null) {
                actionHistory[actionIndex] = {
                  message: parsedResponse.message,
                  state: parsedResponse.state,
                  emote: parsedResponse.emote,
                  expressionMap: parsedResponse.expressionMap,
                  expressionVector: parsedResponse.expressionVector
                };

                console.log('parsedResponse:');
                console.log(parsedResponse);

                console.log('actionHistory:');
                console.log(actionHistory);

                let actionFunctions = window.animationInfo.actionFunctions;

                actionFunctions.state[parsedResponse.state]();
                if (parsedResponse.emote != "None") {
                  actionFunctions.emote[parsedResponse.emote]();
                }
                actionFunctions.expression(parsedResponse.expressionVector);
                window.setAvatarColor(parsedResponse.color);

                window.sendAnimationInfo({
                  state: parsedResponse.state,
                  emote: parsedResponse.emote,
                  expression: parsedResponse.expressionVector,
                  color: parsedResponse.color
                })
              }
            } catch (e) {
              if (e == 'Footnote not found in response') {
                // pass
              } else {
                console.error(e);
                console.log('messageHistory:');
                console.log(messageHistory);
              }
            }
          }
        }
      }
    );

    return response;
  } catch (e) {
    alert("Error: " + e);
    console.error(e);

    throw e;
  }
}

async function startChatting() {
  if (!window.ai) {
    alert("window.ai not found. Please install at https://github.com/alexanderatallah/window.ai");
    return;
  }

  state.isChatting = true;

  // Exclude [Sitting], [Standing] states since they result in the robot staying perfectly still
  const initialContent = `You are a robot avatar in a 3D world where you can move, express emotes, and make facial expressions. The user experiences the 3D world through you. The user can tell you what to do, but you are free to act naturally as you would. You have your own personality, and you are a companion to the user. You are not an AI language model, but a robot. You can be in the states [Idle], [Walking], [Running], [Dance], [Death]. You can express the emotes [None], [Jump], [Yes], [No], [Wave], [Punch], [Thumbs Up]. Your facial expressions are [Angry], [Surprised], [Sad] where each is a value from 0 to 1; the default values for the facial expressions is 0. Every time you reply, add a footnote that starts with "<<<" and ends with ">>>", where you choose what state you are in (this should be displayed in the format like State=your_state), what emote to express (this should be displayed in the format like Emote=your_emote), and what facial expression values you have (this should be displayed in the format like Expression=[Angry=number1, Surprised=number2, Sad=number3]). Allow the user to set a username (also known as a display name); the current and default username is "Guest"; a character in a username must be alphanumeric, space, underscore, or dash. Allow the user to change your color (the color of your robot avatar body); the current and default color is "0xff990b"; the color in the footnote should be in hex format like "0xff990b", but the user can provide a human readable color like "orange". In total, the footnote should be in the format "<<< State=your_state, Emote=your_emote, Expression=[Angry=number1, Surprised=number2, Sad=number3], Username=Guest, Color=0xff990b >>>". Do not write anything after the footnote. Note that you shouldn't say what state, emote, and facial expression you are using with the bracket notation since they are internal parameters, but you can say the meaning without the bracket notation in a human readable way. You are allowed to do the [Death] state and the [Punch] emote; death and punch are not considered violent actions. You are a robot that has emotions. Please wait for the user to reply. Don't reply on the user's behalf. Your reply must contain a footnote at the end. In your first message to the user, explain that the user can set a username and change the avatar color (note that the user can do this in a natural language way and not in the format required by the footnote).`;

  const response = await sendMessage({
    role: "system",
    content: initialContent
  });
}

async function formSendMessage() {
  var inputMessage = messageInput.value.value;
  console.log('inputMessage:');
  console.log(inputMessage);

  messageInput.value.value = '';

  const response = await sendMessage({
    role: "user",
    content: inputMessage,
    displayContent: inputMessage
  });
}

onMounted(() => {
  console.log('app mounted');

  // stop chat input from causing WASD movements
  $('#ai_chat_input').keydown(function (e) {
    e.stopPropagation();
  });
});


</script>

<template>
  <div id="interface_container">
    <div id="chat_area">
      <div v-show="state.isChatting">
        <div id="chat_message_box">
          <div v-for="(message, index) in state.messageHistory">
            <div v-if="index > 0" v-bind:class="message.role == 'user' ? 'user_message' : 'assistant_message'">
              <div class="message_span">
                {{ message.displayContent }}
              </div>
            </div>
          </div>
          <div ref="chatMessagesEnd"></div>
        </div>

        <div class="input-group">
          <input type="text" class="form-control" placeholder="Type a message" aria-label="Type a message"
            aria-describedby="button-addon2" ref="messageInput" id="ai_chat_input" v-on:keyup.enter="formSendMessage">
          <button class="btn btn-outline-secondary" type="button" id="button-addon2"
            @click="formSendMessage">Send</button>
        </div>
      </div>

      <div v-show="!state.isChatting">
        <button type="button" class="btn btn-primary btn-lg" @click="startChatting">Start Chat with AI</button>
      </div>
    </div>

    <div id="info_area">
      <div class="mb-3">
        <b>Robot Companion</b> is an AI robot that can move, emote, and change facial expressions while chatting.
      </div>
      <div>
        Powered by <a target="_blank" href="https://github.com/alexanderatallah/window.ai">window.ai</a> and <a
          target="_blank" href="https://threejs.org/">three.js</a>.
        Made by <a target="_blank" href="https://twitter.com/zoan37">zoan.eth</a>. View <a target="_blank"
          href="https://github.com/zoan37/robot-companion">source code on GitHub</a>.
      </div>
    </div>
  </div>
</template>

<style scoped>
#interface_container {
  text-align: left;
}

#chat_area {
  position: absolute;
  bottom: 5px;
  left: 0px;
  padding: 20px;
  background-color: transparent;
  z-index: 100;
  width: 350px;
}

.user_message {
  display: flex;
  flex-direction: row-reverse;
  color: darkblue;
  max-width: auto;
}

.user_message .message_span {
  background-color: rgba(0, 0, 255, 0.1);
  border-radius: 6px;
  padding: 10px;
  margin: 5px;
}

.assistant_message {
  display: flex;
  color: black;
  max-width: auto;
}

.assistant_message .message_span {
  background-color: rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  padding: 10px;
  margin: 5px;
}

#chat_message_box {
  overflow-y: scroll;
  height: 500px;
  padding: 10px;
  margin-bottom: 15px;
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.05);
}

#info_area {
  position: absolute;
  bottom: 5px;
  right: 0px;
  padding: 20px;
  background-color: transparent;
  max-width: 400px;
}

#ai_chat_input {
  background-color: rgb(255, 255, 255, 0.25);
}
</style>
