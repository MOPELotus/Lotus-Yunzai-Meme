// Checked against MemeCrafters/meme-generator 619fa10518fc2eca4fa1053af37f0a00a839f062.
export const portraitOverlayMetadata = [
  {
    "key": "clown",
    "keywords": [
      "小丑"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": {
        "args_model": {
          "$defs": {
            "UserInfo": {
              "properties": {
                "name": {
                  "default": "",
                  "title": "Name",
                  "type": "string"
                },
                "gender": {
                  "default": "unknown",
                  "enum": [
                    "male",
                    "female",
                    "unknown"
                  ],
                  "title": "Gender",
                  "type": "string"
                }
              },
              "title": "UserInfo",
              "type": "object"
            }
          },
          "properties": {
            "user_infos": {
              "default": [],
              "items": {
                "$ref": "#/$defs/UserInfo"
              },
              "title": "User Infos",
              "type": "array"
            },
            "person": {
              "default": false,
              "description": "是否使用爷爷头轮廓",
              "title": "Person",
              "type": "boolean"
            }
          },
          "title": "Model",
          "type": "object"
        },
        "args_examples": [
          {
            "user_infos": [],
            "person": false
          },
          {
            "user_infos": [],
            "person": true
          }
        ],
        "parser_options": [
          {
            "names": [
              "--person",
              "爷"
            ],
            "args": null,
            "dest": null,
            "default": false,
            "action": {
              "type": 0,
              "value": true
            },
            "help_text": "是否使用爷爷头轮廓",
            "compact": false
          }
        ]
      }
    }
  },
  {
    "key": "my_wife",
    "keywords": [
      "我老婆",
      "这是我老婆"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": {
        "args_model": {
          "$defs": {
            "UserInfo": {
              "properties": {
                "name": {
                  "default": "",
                  "title": "Name",
                  "type": "string"
                },
                "gender": {
                  "default": "unknown",
                  "enum": [
                    "male",
                    "female",
                    "unknown"
                  ],
                  "title": "Gender",
                  "type": "string"
                }
              },
              "title": "UserInfo",
              "type": "object"
            }
          },
          "properties": {
            "user_infos": {
              "default": [],
              "items": {
                "$ref": "#/$defs/UserInfo"
              },
              "title": "User Infos",
              "type": "array"
            },
            "pronoun": {
              "default": "我",
              "description": "人称代词，默认为“我”",
              "title": "Pronoun",
              "type": "string"
            },
            "name": {
              "default": "老婆",
              "description": "称呼，默认为“老婆”",
              "title": "Name",
              "type": "string"
            }
          },
          "title": "Model",
          "type": "object"
        },
        "args_examples": [],
        "parser_options": [
          {
            "names": [
              "-p",
              "--pron"
            ],
            "args": [
              {
                "name": "pronoun",
                "value": "str",
                "default": null,
                "flags": null
              }
            ],
            "dest": "pronoun",
            "default": null,
            "action": null,
            "help_text": "人称代词，默认为“我”",
            "compact": false
          },
          {
            "names": [
              "-n",
              "--name"
            ],
            "args": [
              {
                "name": "name",
                "value": "str",
                "default": null,
                "flags": null
              }
            ],
            "dest": "name",
            "default": null,
            "action": null,
            "help_text": "称呼，默认为“老婆”",
            "compact": false
          }
        ]
      }
    }
  },
  {
    "key": "lim_x_0",
    "keywords": [
      "等价无穷小"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": null
    }
  },
  {
    "key": "out",
    "keywords": [
      "out"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": null
    }
  },
  {
    "key": "throw",
    "keywords": [
      "丢",
      "扔"
    ],
    "tags": [
      "东方Project"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": null
    }
  },
  {
    "key": "crawl",
    "keywords": [
      "爬"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": {
        "args_model": {
          "$defs": {
            "UserInfo": {
              "properties": {
                "name": {
                  "default": "",
                  "title": "Name",
                  "type": "string"
                },
                "gender": {
                  "default": "unknown",
                  "enum": [
                    "male",
                    "female",
                    "unknown"
                  ],
                  "title": "Gender",
                  "type": "string"
                }
              },
              "title": "UserInfo",
              "type": "object"
            }
          },
          "properties": {
            "user_infos": {
              "default": [],
              "items": {
                "$ref": "#/$defs/UserInfo"
              },
              "title": "User Infos",
              "type": "array"
            },
            "number": {
              "default": 0,
              "description": "图片编号，范围为 1~92",
              "title": "Number",
              "type": "integer"
            }
          },
          "title": "Model",
          "type": "object"
        },
        "args_examples": [],
        "parser_options": [
          {
            "names": [
              "-n",
              "--number"
            ],
            "args": [
              {
                "name": "number",
                "value": "int",
                "default": null,
                "flags": null
              }
            ],
            "dest": null,
            "default": null,
            "action": null,
            "help_text": "图片编号，范围为 1~92",
            "compact": false
          }
        ]
      }
    }
  },
  {
    "key": "plana_eat",
    "keywords": [
      "普拉娜吃",
      "普拉娜舔"
    ],
    "tags": [
      "蔚蓝档案",
      "碧蓝档案",
      "普拉娜"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": null
    }
  },
  {
    "key": "seal",
    "keywords": [
      "源石封印"
    ],
    "tags": [
      "明日方舟"
    ],
    "params_type": {
      "min_images": 1,
      "max_images": 1,
      "min_texts": 0,
      "max_texts": 0,
      "default_texts": [],
      "args_type": null
    }
  }
] as const;
